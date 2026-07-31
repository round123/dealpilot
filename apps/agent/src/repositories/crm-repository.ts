import {
  and,
  asc,
  desc,
  eq,
  getTableColumns,
  gt,
  isNotNull,
  isNull,
  like,
  or,
  sql,
} from "drizzle-orm";
import type {
  ContactCreate,
  ContactListQuery,
  ContactUpdate,
  CustomerCreate,
  CustomerDeletedListQuery,
  CustomerListQuery,
  CustomerUpdate,
  FollowUpCreate,
  FollowUpListQuery,
  FollowUpUpdate,
  SocialAccountCreate,
  SocialAccountListQuery,
} from "@dealpilot/shared";
import { db } from "../db/client";
import {
  contacts,
  customers,
  follow_ups,
  local_events,
  projects,
  reminders,
  social_accounts,
} from "../db/schema";

type CustomerUpdates = Partial<typeof customers.$inferInsert>;

export async function listCustomers(params: CustomerListQuery) {
  const conditions = [isNull(customers.deleted_at)];

  if (params.search) {
    const pattern = `%${params.search}%`;
    conditions.push(
      or(
        like(customers.name, pattern),
        like(customers.company, pattern),
        like(customers.country, pattern),
      )!,
    );
  }
  if (params.grade) conditions.push(eq(customers.grade, params.grade));
  if (params.status) conditions.push(eq(customers.status, params.status));

  const sortColumn =
    params.sort === "name"
      ? customers.name
      : params.sort === "grade"
        ? customers.grade
        : params.sort === "updated_at"
          ? customers.updated_at
          : customers.created_at;

  if (params.cursor) {
    const [cursorRow] = await db
      .select()
      .from(customers)
      .where(eq(customers.id, params.cursor))
      .limit(1);
    if (cursorRow) {
      const cursorValue =
        params.sort === "name"
          ? cursorRow.name
          : params.sort === "grade"
            ? cursorRow.grade
            : params.sort === "updated_at"
              ? cursorRow.updated_at
              : cursorRow.created_at;
      conditions.push(
        sql`(${sortColumn} > ${cursorValue} OR (${sortColumn} = ${cursorValue} AND ${customers.id} > ${params.cursor}))`,
      );
    }
  }

  return db
    .select()
    .from(customers)
    .where(and(...conditions))
    .orderBy(asc(sortColumn), asc(customers.id))
    .limit(params.limit + 1);
}

export async function listDeletedCustomers(params: CustomerDeletedListQuery) {
  const conditions = [isNotNull(customers.deleted_at)];

  if (params.cursor) {
    const [cursorRow] = await db
      .select()
      .from(customers)
      .where(
        and(eq(customers.id, params.cursor), isNotNull(customers.deleted_at)),
      )
      .limit(1);
    if (cursorRow?.deleted_at) {
      conditions.push(
        sql`(${customers.deleted_at} < ${cursorRow.deleted_at} OR (${customers.deleted_at} = ${cursorRow.deleted_at} AND ${customers.id} < ${params.cursor}))`,
      );
    }
  }

  return db
    .select()
    .from(customers)
    .where(and(...conditions))
    .orderBy(desc(customers.deleted_at), desc(customers.id))
    .limit(params.limit + 1);
}

export async function findActiveCustomer(customerId: string) {
  const [customer] = await db
    .select()
    .from(customers)
    .where(and(eq(customers.id, customerId), isNull(customers.deleted_at)))
    .limit(1);
  return customer;
}

export async function findCustomer(customerId: string) {
  const [customer] = await db
    .select()
    .from(customers)
    .where(eq(customers.id, customerId))
    .limit(1);
  return customer;
}

export async function getCustomerDetail(customerId: string) {
  const customer = await findActiveCustomer(customerId);
  if (!customer) return undefined;

  const [
    customerContacts,
    accounts,
    customerProjects,
    recentFollowUps,
    openReminders,
  ] = await Promise.all([
    db.select().from(contacts).where(eq(contacts.customer_id, customerId)),
    db
      .select()
      .from(social_accounts)
      .where(eq(social_accounts.customer_id, customerId)),
    db.select().from(projects).where(eq(projects.customer_id, customerId)),
    db
      .select()
      .from(follow_ups)
      .where(eq(follow_ups.customer_id, customerId))
      .orderBy(desc(follow_ups.occurred_at))
      .limit(10),
    db
      .select()
      .from(reminders)
      .where(
        and(
          eq(reminders.customer_id, customerId),
          sql`${reminders.status} IN ('pending', 'snoozed', 'overdue')`,
        ),
      )
      .orderBy(asc(reminders.due_at)),
  ]);

  return {
    ...customer,
    contacts: customerContacts,
    social_accounts: accounts,
    projects: customerProjects,
    recent_follow_ups: recentFollowUps,
    open_reminders: openReminders,
  };
}

export async function insertCustomer(input: CustomerCreate) {
  const now = new Date().toISOString();
  const [created] = await db
    .insert(customers)
    .values({
      name: input.name,
      company: input.company ?? null,
      country: input.country ?? null,
      source: input.source ?? null,
      grade: input.grade,
      status: input.status,
      created_at: now,
      updated_at: now,
    })
    .returning();
  return created;
}

export async function updateCustomerRecord(
  customerId: string,
  input: CustomerUpdate,
) {
  const [updated] = await db
    .update(customers)
    .set({ ...input, updated_at: new Date().toISOString() })
    .where(and(eq(customers.id, customerId), isNull(customers.deleted_at)))
    .returning();
  return updated;
}

export async function softDeleteCustomerRecord(customerId: string) {
  return db.transaction(async (tx) => {
    const [customer] = await tx
      .select()
      .from(customers)
      .where(and(eq(customers.id, customerId), isNull(customers.deleted_at)))
      .limit(1);
    if (!customer) return false;

    const now = new Date().toISOString();
    const openReminders = await tx
      .select({
        id: reminders.id,
        status: reminders.status,
        resolution: reminders.resolution,
      })
      .from(reminders)
      .where(
        and(
          eq(reminders.customer_id, customerId),
          sql`${reminders.status} IN ('pending', 'snoozed', 'overdue')`,
        ),
      );

    await tx
      .update(customers)
      .set({ deleted_at: now, updated_at: now })
      .where(eq(customers.id, customerId));
    await tx
      .update(reminders)
      .set({
        status: "ignored",
        updated_at: now,
        resolution: "Customer deleted",
      })
      .where(
        and(
          eq(reminders.customer_id, customerId),
          sql`${reminders.status} IN ('pending', 'snoozed', 'overdue')`,
        ),
      );
    await tx.insert(local_events).values({
      event_type: "customer.soft_deleted",
      entity_type: "customer",
      entity_id: customerId,
      metadata: JSON.stringify({ reminders: openReminders }),
      occurred_at: now,
    });
    return true;
  });
}

export async function restoreCustomerRecord(customerId: string) {
  return db.transaction(async (tx) => {
    const [customer] = await tx
      .select()
      .from(customers)
      .where(eq(customers.id, customerId))
      .limit(1);
    if (!customer) return { status: "not_found" as const };
    if (!customer.deleted_at) return { status: "not_deleted" as const };

    const [deletionEvent] = await tx
      .select({ metadata: local_events.metadata })
      .from(local_events)
      .where(
        and(
          eq(local_events.event_type, "customer.soft_deleted"),
          eq(local_events.entity_id, customerId),
        ),
      )
      .orderBy(desc(local_events.occurred_at), desc(local_events.id))
      .limit(1);

    const reminderStates = parseDeletedReminderStates(deletionEvent?.metadata);
    const now = new Date().toISOString();
    for (const reminder of reminderStates) {
      await tx
        .update(reminders)
        .set({
          status: reminder.status,
          resolution: reminder.resolution,
          updated_at: now,
        })
        .where(
          and(
            eq(reminders.id, reminder.id),
            eq(reminders.customer_id, customerId),
            eq(reminders.status, "ignored"),
            eq(reminders.resolution, "Customer deleted"),
          ),
        );
    }

    const [restored] = await tx
      .update(customers)
      .set({ deleted_at: null, updated_at: now })
      .where(eq(customers.id, customerId))
      .returning();
    return { status: "restored" as const, customer: restored };
  });
}

type RestorableReminderState = {
  id: string;
  status: "pending" | "snoozed" | "overdue";
  resolution: string | null;
};

function parseDeletedReminderStates(
  metadata: string | null | undefined,
): RestorableReminderState[] {
  if (!metadata) return [];
  try {
    const parsed = JSON.parse(metadata) as { reminders?: unknown };
    if (!Array.isArray(parsed.reminders)) return [];
    return parsed.reminders.filter(
      (value): value is RestorableReminderState => {
        if (!value || typeof value !== "object") return false;
        const reminder = value as Partial<RestorableReminderState>;
        return (
          typeof reminder.id === "string" &&
          (reminder.status === "pending" ||
            reminder.status === "snoozed" ||
            reminder.status === "overdue") &&
          (reminder.resolution === null ||
            typeof reminder.resolution === "string")
        );
      },
    );
  } catch {
    return [];
  }
}

export async function mergeCustomerRecords(
  sourceId: string,
  targetId: string,
  targetUpdates: CustomerUpdates,
) {
  return db.transaction(async (tx) => {
    const [source] = await tx
      .select()
      .from(customers)
      .where(eq(customers.id, sourceId))
      .limit(1);
    const [target] = await tx
      .select()
      .from(customers)
      .where(eq(customers.id, targetId))
      .limit(1);
    if (!source) return { status: "source_not_found" as const };
    if (!target) return { status: "target_not_found" as const };

    await tx
      .update(contacts)
      .set({ customer_id: targetId })
      .where(eq(contacts.customer_id, sourceId));
    await tx
      .update(social_accounts)
      .set({ customer_id: targetId })
      .where(eq(social_accounts.customer_id, sourceId));
    await tx
      .update(projects)
      .set({ customer_id: targetId })
      .where(eq(projects.customer_id, sourceId));
    await tx
      .update(follow_ups)
      .set({ customer_id: targetId })
      .where(eq(follow_ups.customer_id, sourceId));
    await tx
      .update(reminders)
      .set({ customer_id: targetId })
      .where(eq(reminders.customer_id, sourceId));

    const now = new Date().toISOString();
    if (Object.keys(targetUpdates).length > 0) {
      await tx
        .update(customers)
        .set({ ...targetUpdates, updated_at: now })
        .where(eq(customers.id, targetId));
    }
    await tx
      .update(customers)
      .set({ deleted_at: now, updated_at: now })
      .where(eq(customers.id, sourceId));

    const [result] = await tx
      .select()
      .from(customers)
      .where(eq(customers.id, targetId))
      .limit(1);
    return { status: "merged" as const, customer: result };
  });
}

export async function listContacts(customerId: string) {
  return db.select().from(contacts).where(eq(contacts.customer_id, customerId));
}

export async function listContactRecords(query: ContactListQuery) {
  const conditions = [isNull(customers.deleted_at)];
  if (query.customer_id) {
    conditions.push(eq(contacts.customer_id, query.customer_id));
  }
  if (query.cursor) conditions.push(gt(contacts.id, query.cursor));

  return db
    .select(getTableColumns(contacts))
    .from(contacts)
    .innerJoin(customers, eq(contacts.customer_id, customers.id))
    .where(and(...conditions))
    .orderBy(asc(contacts.id))
    .limit(query.limit + 1);
}

export async function insertContact(customerId: string, input: ContactCreate) {
  const [created] = await db
    .insert(contacts)
    .values({
      customer_id: customerId,
      name: input.name,
      title: input.title ?? null,
      email: input.email || null,
      phone: input.phone || null,
    })
    .returning();
  return created;
}

export async function updateContactRecord(
  contactId: string,
  input: ContactUpdate,
) {
  const [updated] = await db
    .update(contacts)
    .set(input)
    .where(eq(contacts.id, contactId))
    .returning();
  return updated;
}

export async function deleteContactRecord(contactId: string) {
  await db.delete(contacts).where(eq(contacts.id, contactId));
}

export async function listSocialAccounts(customerId: string) {
  return db
    .select()
    .from(social_accounts)
    .where(eq(social_accounts.customer_id, customerId));
}

export async function listSocialAccountRecords(query: SocialAccountListQuery) {
  const conditions = [isNull(customers.deleted_at)];
  if (query.customer_id) {
    conditions.push(eq(social_accounts.customer_id, query.customer_id));
  }
  if (query.cursor) conditions.push(gt(social_accounts.id, query.cursor));

  return db
    .select(getTableColumns(social_accounts))
    .from(social_accounts)
    .innerJoin(customers, eq(social_accounts.customer_id, customers.id))
    .where(and(...conditions))
    .orderBy(asc(social_accounts.id))
    .limit(query.limit + 1);
}

export async function findSocialAccount(
  platform: string,
  normalizedIdentifier: string,
) {
  const [account] = await db
    .select()
    .from(social_accounts)
    .where(
      and(
        eq(social_accounts.platform, platform),
        eq(social_accounts.normalized_identifier, normalizedIdentifier),
      ),
    )
    .limit(1);
  return account;
}

export async function insertSocialAccount(
  customerId: string,
  input: SocialAccountCreate,
  normalizedIdentifier: string,
) {
  const [created] = await db
    .insert(social_accounts)
    .values({
      customer_id: customerId,
      contact_id: input.contact_id ?? null,
      platform: input.platform,
      raw_identifier: input.raw_identifier,
      normalized_identifier: normalizedIdentifier,
      manually_bound: false,
    })
    .returning();
  return created;
}

export async function deleteSocialAccountRecord(accountId: string) {
  await db.delete(social_accounts).where(eq(social_accounts.id, accountId));
}

export async function findMatchingCustomers(
  platform: string,
  normalizedIdentifier: string,
) {
  return db
    .select({ customer: customers })
    .from(social_accounts)
    .innerJoin(customers, eq(social_accounts.customer_id, customers.id))
    .where(
      and(
        eq(social_accounts.platform, platform),
        eq(social_accounts.normalized_identifier, normalizedIdentifier),
        isNull(customers.deleted_at),
      ),
    );
}

export async function upsertManualBinding(
  customerId: string,
  platform: string,
  rawIdentifier: string,
  normalizedIdentifier: string,
) {
  const existing = await findSocialAccount(platform, normalizedIdentifier);
  if (existing) {
    const [updated] = await db
      .update(social_accounts)
      .set({
        customer_id: customerId,
        raw_identifier: rawIdentifier,
        manually_bound: true,
      })
      .where(eq(social_accounts.id, existing.id))
      .returning();
    return updated;
  }

  const [created] = await db
    .insert(social_accounts)
    .values({
      customer_id: customerId,
      platform,
      raw_identifier: rawIdentifier,
      normalized_identifier: normalizedIdentifier,
      manually_bound: true,
    })
    .returning();
  return created;
}

export async function deleteBinding(
  platform: string,
  normalizedIdentifier: string,
) {
  await db
    .delete(social_accounts)
    .where(
      and(
        eq(social_accounts.platform, platform),
        eq(social_accounts.normalized_identifier, normalizedIdentifier),
      ),
    );
}

export async function listFollowUps(params: FollowUpListQuery) {
  const conditions = [];
  if (params.customer_id)
    conditions.push(eq(follow_ups.customer_id, params.customer_id));
  if (params.project_id)
    conditions.push(eq(follow_ups.project_id, params.project_id));
  if (params.cursor) {
    const [cursorRow] = await db
      .select()
      .from(follow_ups)
      .where(eq(follow_ups.id, params.cursor))
      .limit(1);
    if (cursorRow) {
      conditions.push(
        sql`(${follow_ups.occurred_at} < ${cursorRow.occurred_at} OR (${follow_ups.occurred_at} = ${cursorRow.occurred_at} AND ${follow_ups.id} < ${params.cursor}))`,
      );
    }
  }

  const base = db
    .select()
    .from(follow_ups)
    .orderBy(desc(follow_ups.occurred_at), desc(follow_ups.id))
    .limit(params.limit + 1);
  return conditions.length > 0 ? base.where(and(...conditions)) : base;
}

export async function insertFollowUp(input: FollowUpCreate) {
  const [created] = await db
    .insert(follow_ups)
    .values({
      customer_id: input.customer_id,
      project_id: input.project_id ?? null,
      type: input.type,
      note: input.note ?? null,
      message_body: input.message_body ?? null,
      message_direction: input.message_direction ?? null,
      occurred_at: input.occurred_at,
      created_at: new Date().toISOString(),
    })
    .returning();
  return created;
}

export async function updateFollowUpRecord(
  followUpId: string,
  input: FollowUpUpdate,
) {
  const [updated] = await db
    .update(follow_ups)
    .set(input)
    .where(eq(follow_ups.id, followUpId))
    .returning();
  return updated;
}

export async function deleteFollowUpRecord(followUpId: string) {
  await db.delete(follow_ups).where(eq(follow_ups.id, followUpId));
}
