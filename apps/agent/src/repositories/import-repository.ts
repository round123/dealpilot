import { and, eq, isNull, or } from "drizzle-orm";
import { db } from "../db/client";
import { contacts, customers, import_jobs } from "../db/schema";

export interface ImportCustomerRow {
  valid: boolean;
  action: "create" | "merge" | "skip";
  targetCustomerId?: string;
  name: string;
  company: string | null;
  country: string | null;
  source: string | null;
  grade: "A" | "B" | "C";
  contactName: string | null;
  email: string | null;
  phone: string | null;
}

export interface ImportJobMetadata {
  fileName: string;
  totalRows: number;
  validRows: number;
  failedRows: number;
  duplicateCount: number;
}

export async function findDuplicateCustomer(
  name: string,
  email: string | null,
) {
  const match = email
    ? or(eq(customers.name, name), eq(contacts.email, email))
    : eq(customers.name, name);
  const [existing] = await db
    .select({ customer: customers })
    .from(customers)
    .leftJoin(contacts, eq(contacts.customer_id, customers.id))
    .where(and(isNull(customers.deleted_at), match))
    .limit(1);
  return existing?.customer;
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
          .where(eq(customers.id, row.targetCustomerId!))
          .limit(1)
          .all();
        if (!target)
          throw new Error(`Merge target ${row.targetCustomerId} not found`);
        tx.update(customers)
          .set({
            company: target.company ?? row.company,
            country: target.country ?? row.country,
            source: target.source ?? row.source,
            updated_at: new Date().toISOString(),
          })
          .where(eq(customers.id, target.id))
          .run();
        duplicates++;
        continue;
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
      success++;
    }

    tx.update(import_jobs)
      .set({ status: "committed" })
      .where(eq(import_jobs.id, jobId))
      .run();
    return { success, failed, skipped, duplicates };
  });
}
