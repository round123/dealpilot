/**
 * DealPilot 路由 - Contacts
 * PUT/DELETE /contacts/:id, GET/POST /customers/:id/contacts
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { eq, and, isNull } from "drizzle-orm";
import { db } from "../db/client";
import { contacts, customers } from "../db/schema";
import {
  ContactCreateSchema,
  ContactUpdateSchema,
} from "@dealpilot/shared";
import { normalizeEmail, normalizePhone } from "@dealpilot/shared";
import { ApiError } from "../middleware/error-handler";

const app = new Hono();

// GET /customers/:id/contacts - 联系人列表
app.get("/customers/:id/contacts", async (c) => {
  const customerId = c.req.param("id");

  // 验证客户存在
  const [customer] = await db
    .select()
    .from(customers)
    .where(and(eq(customers.id, customerId), isNull(customers.deleted_at)))
    .limit(1);

  if (!customer) {
    throw ApiError.notFound("Customer not found");
  }

  const customerContacts = await db
    .select()
    .from(contacts)
    .where(eq(contacts.customer_id, customerId));

  return c.json(customerContacts);
});

// POST /customers/:id/contacts - 新建联系人
app.post("/customers/:id/contacts", zValidator("json", ContactCreateSchema), async (c) => {
  const customerId = c.req.param("id");
  const body = c.req.valid("json");

  // 验证客户存在
  const [customer] = await db
    .select()
    .from(customers)
    .where(and(eq(customers.id, customerId), isNull(customers.deleted_at)))
    .limit(1);

  if (!customer) {
    throw ApiError.notFound("Customer not found");
  }

  const [created] = await db
    .insert(contacts)
    .values({
      customer_id: customerId,
      name: body.name,
      title: body.title ?? null,
      email: normalizeEmail(body.email),
      phone: normalizePhone(body.phone),
    })
    .returning();

  return c.json(created, 201);
});

// PUT /contacts/:id - 编辑联系人
app.put("/contacts/:id", zValidator("json", ContactUpdateSchema), async (c) => {
  const id = c.req.param("id");
  const body = c.req.valid("json");

  const updates: Record<string, unknown> = {};
  if (body.name !== undefined) updates.name = body.name;
  if (body.title !== undefined) updates.title = body.title;
  if (body.email !== undefined) updates.email = normalizeEmail(body.email);
  if (body.phone !== undefined) updates.phone = normalizePhone(body.phone);

  const [updated] = await db
    .update(contacts)
    .set(updates)
    .where(eq(contacts.id, id))
    .returning();

  if (!updated) {
    throw ApiError.notFound("Contact not found");
  }

  return c.json(updated);
});

// DELETE /contacts/:id - 删除联系人
app.delete("/contacts/:id", async (c) => {
  const id = c.req.param("id");
  await db.delete(contacts).where(eq(contacts.id, id));
  return c.body(null, 204);
});

export default app;
