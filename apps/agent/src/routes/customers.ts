/**
 * DealPilot 路由 - Customers
 * GET/POST/PUT/DELETE /customers, POST /customers/:id/restore, POST /customers/merge
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { eq, and, isNull, sql, like, or, desc, asc } from "drizzle-orm";
import { db } from "../db/client";
import { customers, contacts, social_accounts, projects, follow_ups, reminders } from "../db/schema";
import {
  CustomerCreateSchema,
  CustomerUpdateSchema,
  CustomerMergeSchema,
  CustomerListQuerySchema,
} from "@dealpilot/shared";
import { ApiError } from "../middleware/error-handler";
import {
  softDeleteCustomer,
  restoreCustomer,
  mergeCustomers,
} from "../services/customer-service";

const app = new Hono();

// GET /customers - 客户列表（游标分页）
app.get("/customers", async (c) => {
  const params = CustomerListQuerySchema.parse({
    cursor: c.req.query("cursor"),
    limit: c.req.query("limit") ?? "20",
    search: c.req.query("search"),
    grade: c.req.query("grade"),
    status: c.req.query("status"),
    sort: c.req.query("sort") ?? "created_at",
  });

  const conditions = [isNull(customers.deleted_at)];

  if (params.search) {
    const searchPattern = `%${params.search}%`;
    conditions.push(
      or(
        like(customers.name, searchPattern),
        like(customers.company, searchPattern),
        like(customers.country, searchPattern),
      )!,
    );
  }
  if (params.grade) {
    conditions.push(eq(customers.grade, params.grade));
  }
  if (params.status) {
    conditions.push(eq(customers.status, params.status));
  }

  const sortColumn = params.sort === "name" ? customers.name
    : params.sort === "grade" ? customers.grade
    : params.sort === "updated_at" ? customers.updated_at
    : customers.created_at;

  // 游标分页：cursor 是上一页最后一条记录的 id
  let cursorCondition = null;
  if (params.cursor) {
    // 获取 cursor 记录的排序值，然后取大于该值的记录
    const [cursorRow] = await db
      .select()
      .from(customers)
      .where(eq(customers.id, params.cursor))
      .limit(1);
    if (cursorRow) {
      conditions.push(sql`${sortColumn} > ${cursorRow[params.sort === "name" ? "name" : params.sort === "grade" ? "grade" : params.sort === "updated_at" ? "updated_at" : "created_at"]}`);
    }
  }

  const allRows = await db
    .select()
    .from(customers)
    .where(and(...conditions))
    .orderBy(asc(sortColumn))
    .limit(params.limit + 1);

  let results = allRows;
  let nextCursor: string | null = null;
  if (allRows.length > params.limit) {
    results = allRows.slice(0, params.limit);
    nextCursor = results[results.length - 1].id;
  }

  return c.json({ items: results, next_cursor: nextCursor });
});

// POST /customers - 新建客户
app.post("/customers", zValidator("json", CustomerCreateSchema), async (c) => {
  const body = c.req.valid("json");
  const now = new Date().toISOString();

  const [created] = await db
    .insert(customers)
    .values({
      ...body,
      created_at: now,
      updated_at: now,
    })
    .returning();

  return c.json(created, 201);
});

// GET /customers/:id - 客户档案详情
app.get("/customers/:id", async (c) => {
  const id = c.req.param("id");

  const [customer] = await db
    .select()
    .from(customers)
    .where(and(eq(customers.id, id), isNull(customers.deleted_at)))
    .limit(1);

  if (!customer) {
    throw ApiError.notFound("Customer not found");
  }

  const customerContacts = await db
    .select()
    .from(contacts)
    .where(eq(contacts.customer_id, id));

  const customerSocialAccounts = await db
    .select()
    .from(social_accounts)
    .where(eq(social_accounts.customer_id, id));

  const customerProjects = await db
    .select()
    .from(projects)
    .where(eq(projects.customer_id, id));

  const recentFollowUps = await db
    .select()
    .from(follow_ups)
    .where(eq(follow_ups.customer_id, id))
    .orderBy(desc(follow_ups.occurred_at))
    .limit(10);

  const openReminders = await db
    .select()
    .from(reminders)
    .where(
      and(
        eq(reminders.customer_id, id),
        sql`${reminders.status} IN ('pending', 'snoozed', 'overdue')`,
      ),
    )
    .orderBy(asc(reminders.due_at));

  return c.json({
    ...customer,
    contacts: customerContacts,
    social_accounts: customerSocialAccounts,
    recent_follow_ups: recentFollowUps,
    open_reminders: openReminders,
    projects: customerProjects,
  });
});

// PUT /customers/:id - 编辑客户
app.put("/customers/:id", zValidator("json", CustomerUpdateSchema), async (c) => {
  const id = c.req.param("id");
  const body = c.req.valid("json");
  const now = new Date().toISOString();

  const [updated] = await db
    .update(customers)
    .set({ ...body, updated_at: now })
    .where(and(eq(customers.id, id), isNull(customers.deleted_at)))
    .returning();

  if (!updated) {
    throw ApiError.notFound("Customer not found");
  }

  return c.json(updated);
});

// DELETE /customers/:id - 软删除客户
app.delete("/customers/:id", async (c) => {
  const id = c.req.param("id");
  await softDeleteCustomer(id);
  return c.body(null, 204);
});

// POST /customers/:id/restore - 恢复已删除客户
app.post("/customers/:id/restore", async (c) => {
  const id = c.req.param("id");
  const restored = await restoreCustomer(id);
  return c.json(restored);
});

// POST /customers/merge - 合并客户
app.post("/customers/merge", zValidator("json", CustomerMergeSchema), async (c) => {
  const body = c.req.valid("json");
  const result = await mergeCustomers(body);
  return c.json(result);
});

export default app;
