import { and, eq, isNull, or, sql } from "drizzle-orm";
import { db } from "../db/client";
import {
  contacts,
  customers,
  import_jobs,
  social_accounts,
} from "../db/schema";

export interface ImportCustomerRow {
  rowIndex: number;
  valid: boolean;
  action: "create" | "merge" | "skip";
  allowDuplicate: boolean;
  targetCustomerId?: string;
  name: string;
  company: string | null;
  country: string | null;
  source: string | null;
  grade: "A" | "B" | "C";
  contactName: string | null;
  email: string | null;
  phone: string | null;
  platform: string | null;
  platformAccount: string | null;
  normalizedPlatformAccount: string | null;
}

export type ImportExactMatchField = "email" | "phone" | "platform_account";
export type ImportHintField = "name" | "company";

export interface ImportCustomerSnapshot {
  customer_id?: string;
  name: string;
  company: string | null;
  country: string | null;
  source: string | null;
  grade: "A" | "B" | "C";
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  platform: string | null;
  platform_account: string | null;
}

export interface ImportCustomerCandidate {
  customer: ImportCustomerSnapshot & { customer_id: string };
  matchedBy: ImportExactMatchField[];
}

export interface ImportCustomerHint {
  customerId: string;
  name: string;
  company: string | null;
  matchedBy: ImportHintField[];
}

export interface ImportJobMetadata {
  fileName: string;
  totalRows: number;
  validRows: number;
  failedRows: number;
  duplicateCount: number;
}

export interface ImportCommitWarning {
  code: "PLATFORM_ACCOUNT_NOT_COPIED";
  row_index: number;
  field: "platform_account";
  platform: string;
  platform_account: string;
  existing_customer_id: string;
}

export class ImportMergeTargetUnavailableError extends Error {
  constructor(customerId: string) {
    super(`Import merge target ${customerId} is no longer an exact match`);
    this.name = "ImportMergeTargetUnavailableError";
  }
}

export class ImportPreviewStaleError extends Error {
  constructor() {
    super("An exact duplicate was created after the import preview");
    this.name = "ImportPreviewStaleError";
  }
}

export async function findImportCandidates(row: ImportCustomerRow): Promise<{
  exact: ImportCustomerCandidate[];
  hints: ImportCustomerHint[];
}> {
  const exactMatches = new Map<string, Set<ImportExactMatchField>>();
  const addExact = (customerId: string, field: ImportExactMatchField) => {
    const fields =
      exactMatches.get(customerId) ?? new Set<ImportExactMatchField>();
    fields.add(field);
    exactMatches.set(customerId, fields);
  };

  if (row.email) {
    const emailMatches = await db
      .select({ customerId: customers.id })
      .from(customers)
      .innerJoin(contacts, eq(contacts.customer_id, customers.id))
      .where(
        and(
          isNull(customers.deleted_at),
          sql`lower(${contacts.email}) = ${row.email.toLowerCase()}`,
        ),
      );
    for (const match of emailMatches) addExact(match.customerId, "email");
  }

  // Only a canonical E.164 number is a duplicate key. Local/non-canonical
  // numbers remain importable and can be corrected after import.
  if (row.phone && /^\+[1-9]\d{6,14}$/.test(row.phone)) {
    const phoneMatches = await db
      .select({ customerId: customers.id })
      .from(customers)
      .innerJoin(contacts, eq(contacts.customer_id, customers.id))
      .where(and(isNull(customers.deleted_at), eq(contacts.phone, row.phone)));
    for (const match of phoneMatches) addExact(match.customerId, "phone");
  }

  if (row.platform && row.normalizedPlatformAccount) {
    const accountMatches = await db
      .select({ customerId: customers.id })
      .from(customers)
      .innerJoin(social_accounts, eq(social_accounts.customer_id, customers.id))
      .where(
        and(
          isNull(customers.deleted_at),
          eq(social_accounts.platform, row.platform),
          eq(
            social_accounts.normalized_identifier,
            row.normalizedPlatformAccount,
          ),
        ),
      );
    for (const match of accountMatches)
      addExact(match.customerId, "platform_account");
  }

  const exact: ImportCustomerCandidate[] = [];
  for (const [customerId, matchedBy] of exactMatches) {
    const customer = await findCustomerSnapshot(customerId, row);
    if (customer) exact.push({ customer, matchedBy: [...matchedBy] });
  }

  const hintRows = await db
    .select({
      customerId: customers.id,
      name: customers.name,
      company: customers.company,
    })
    .from(customers)
    .where(
      and(
        isNull(customers.deleted_at),
        or(
          sql`lower(${customers.name}) = ${row.name.toLowerCase()}`,
          row.company
            ? sql`lower(${customers.company}) = ${row.company.toLowerCase()}`
            : undefined,
        ),
      ),
    );
  const hints = hintRows
    .filter(({ customerId }) => !exactMatches.has(customerId))
    .map(({ customerId, name, company }) => ({
      customerId,
      name,
      company,
      matchedBy: [
        ...(name.toLowerCase() === row.name.toLowerCase()
          ? (["name"] as const)
          : []),
        ...(company &&
        row.company &&
        company.toLowerCase() === row.company.toLowerCase()
          ? (["company"] as const)
          : []),
      ],
    }));

  return { exact, hints };
}

async function findCustomerSnapshot(
  customerId: string,
  incoming: ImportCustomerRow,
): Promise<(ImportCustomerSnapshot & { customer_id: string }) | undefined> {
  const [customer] = await db
    .select()
    .from(customers)
    .where(and(eq(customers.id, customerId), isNull(customers.deleted_at)))
    .limit(1);
  if (!customer) return undefined;

  const customerContacts = await db
    .select()
    .from(contacts)
    .where(eq(contacts.customer_id, customerId));
  const contact =
    customerContacts.find(
      (item) =>
        (incoming.email &&
          item.email?.toLowerCase() === incoming.email.toLowerCase()) ||
        (incoming.phone && item.phone === incoming.phone),
    ) ?? customerContacts[0];
  const accounts = await db
    .select()
    .from(social_accounts)
    .where(eq(social_accounts.customer_id, customerId));
  const account =
    accounts.find(
      (item) =>
        item.platform === incoming.platform &&
        item.normalized_identifier === incoming.normalizedPlatformAccount,
    ) ?? accounts[0];

  return {
    customer_id: customer.id,
    name: customer.name,
    company: customer.company,
    country: customer.country,
    source: customer.source,
    grade: customer.grade,
    contact_name: contact?.name ?? null,
    email: contact?.email ?? null,
    phone: contact?.phone ?? null,
    platform: account?.platform ?? null,
    platform_account: account?.raw_identifier ?? null,
  };
}

export async function findImportJob(jobId: string) {
  const [job] = await db
    .select()
    .from(import_jobs)
    .where(eq(import_jobs.id, jobId))
    .limit(1);
  return job;
}

export function commitImportRows(
  jobId: string,
  rows: ImportCustomerRow[],
  job: ImportJobMetadata,
) {
  return db.transaction((tx) => {
    tx.insert(import_jobs)
      .values({
        id: jobId,
        file_name: job.fileName,
        total_rows: job.totalRows,
        valid_rows: job.validRows,
        failed_rows: job.failedRows,
        duplicate_count: job.duplicateCount,
        status: "previewing",
      })
      .run();

    let success = 0;
    let failed = 0;
    let skipped = 0;
    let duplicates = 0;
    const warnings: ImportCommitWarning[] = [];

    for (const row of rows) {
      if (!row.valid) {
        failed++;
        continue;
      }
      if (row.action === "skip") {
        skipped++;
        continue;
      }
      if (row.action === "merge") {
        const [target] = tx
          .select()
          .from(customers)
          .where(
            and(
              eq(customers.id, row.targetCustomerId!),
              isNull(customers.deleted_at),
            ),
          )
          .limit(1)
          .all();
        if (!target) {
          throw new ImportMergeTargetUnavailableError(row.targetCustomerId!);
        }
        const targetContacts = tx
          .select()
          .from(contacts)
          .where(eq(contacts.customer_id, target.id))
          .all();
        const targetAccounts = tx
          .select()
          .from(social_accounts)
          .where(eq(social_accounts.customer_id, target.id))
          .all();
        const stillMatches =
          Boolean(
            row.email &&
            targetContacts.some(
              (contact) =>
                contact.email?.toLowerCase() === row.email?.toLowerCase(),
            ),
          ) ||
          Boolean(
            row.phone &&
            /^\+[1-9]\d{6,14}$/.test(row.phone) &&
            targetContacts.some((contact) => contact.phone === row.phone),
          ) ||
          Boolean(
            row.platform &&
            row.normalizedPlatformAccount &&
            targetAccounts.some(
              (account) =>
                account.platform === row.platform &&
                account.normalized_identifier === row.normalizedPlatformAccount,
            ),
          );
        if (!stillMatches) {
          throw new ImportMergeTargetUnavailableError(target.id);
        }
        tx.update(customers)
          .set({
            company: target.company || row.company,
            country: target.country || row.country,
            source: target.source || row.source,
            updated_at: new Date().toISOString(),
          })
          .where(eq(customers.id, target.id))
          .run();
        const targetContact = targetContacts.find(
          (item) =>
            (row.email &&
              item.email?.toLowerCase() === row.email.toLowerCase()) ||
            (row.phone && item.phone === row.phone),
        );
        if (targetContact) {
          tx.update(contacts)
            .set({
              name: targetContact.name || row.contactName || row.name,
              email: targetContact.email || row.email,
              phone: targetContact.phone || row.phone,
            })
            .where(eq(contacts.id, targetContact.id))
            .run();
        } else if (row.contactName || row.email || row.phone) {
          tx.insert(contacts)
            .values({
              customer_id: target.id,
              name: row.contactName ?? row.name,
              email: row.email,
              phone: row.phone,
              created_at: new Date().toISOString(),
            })
            .run();
        }
        if (
          row.platform &&
          row.platformAccount &&
          row.normalizedPlatformAccount
        ) {
          const [existingAccount] = tx
            .select()
            .from(social_accounts)
            .where(
              and(
                eq(social_accounts.platform, row.platform),
                eq(
                  social_accounts.normalized_identifier,
                  row.normalizedPlatformAccount,
                ),
              ),
            )
            .limit(1)
            .all();
          if (!existingAccount) {
            tx.insert(social_accounts)
              .values({
                customer_id: target.id,
                platform: row.platform,
                raw_identifier: row.platformAccount,
                normalized_identifier: row.normalizedPlatformAccount,
                manually_bound: false,
                created_at: new Date().toISOString(),
              })
              .run();
          }
        }
        duplicates++;
        continue;
      }

      if (!row.allowDuplicate) {
        const emailExists = row.email
          ? tx
              .select({ id: customers.id })
              .from(customers)
              .innerJoin(contacts, eq(contacts.customer_id, customers.id))
              .where(
                and(
                  isNull(customers.deleted_at),
                  sql`lower(${contacts.email}) = ${row.email.toLowerCase()}`,
                ),
              )
              .limit(1)
              .all().length > 0
          : false;
        const phoneExists =
          row.phone && /^\+[1-9]\d{6,14}$/.test(row.phone)
            ? tx
                .select({ id: customers.id })
                .from(customers)
                .innerJoin(contacts, eq(contacts.customer_id, customers.id))
                .where(
                  and(
                    isNull(customers.deleted_at),
                    eq(contacts.phone, row.phone),
                  ),
                )
                .limit(1)
                .all().length > 0
            : false;
        const platformAccountExists = Boolean(
          findExistingPlatformAccount(tx, row),
        );
        if (emailExists || phoneExists || platformAccountExists) {
          throw new ImportPreviewStaleError();
        }
      }

      const customerId = crypto.randomUUID();
      const importedAt = new Date().toISOString();
      tx.insert(customers)
        .values({
          id: customerId,
          name: row.name,
          company: row.company,
          country: row.country,
          source: row.source,
          grade: row.grade,
          status: "active",
          created_at: importedAt,
          updated_at: importedAt,
        })
        .run();
      if (row.contactName || row.email || row.phone) {
        tx.insert(contacts)
          .values({
            customer_id: customerId,
            name: row.contactName ?? row.name,
            email: row.email,
            phone: row.phone,
            created_at: importedAt,
          })
          .run();
      }
      if (
        row.platform &&
        row.platformAccount &&
        row.normalizedPlatformAccount
      ) {
        const existingPlatformAccount = findExistingPlatformAccount(tx, row);
        if (existingPlatformAccount) {
          warnings.push({
            code: "PLATFORM_ACCOUNT_NOT_COPIED",
            row_index: row.rowIndex,
            field: "platform_account",
            platform: row.platform,
            platform_account: row.platformAccount,
            existing_customer_id: existingPlatformAccount.customerId,
          });
        } else {
          tx.insert(social_accounts)
            .values({
              customer_id: customerId,
              platform: row.platform,
              raw_identifier: row.platformAccount,
              normalized_identifier: row.normalizedPlatformAccount,
              manually_bound: false,
              created_at: importedAt,
            })
            .run();
        }
      }
      success++;
    }

    tx.update(import_jobs)
      .set({ status: "committed" })
      .where(eq(import_jobs.id, jobId))
      .run();
    return { success, failed, skipped, duplicates, warnings };
  });
}

function findExistingPlatformAccount(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  row: ImportCustomerRow,
) {
  if (!row.platform || !row.normalizedPlatformAccount) return undefined;
  const [existing] = tx
    .select({ customerId: social_accounts.customer_id })
    .from(social_accounts)
    .where(
      and(
        eq(social_accounts.platform, row.platform),
        eq(
          social_accounts.normalized_identifier,
          row.normalizedPlatformAccount,
        ),
      ),
    )
    .limit(1)
    .all();
  return existing;
}
