import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import {
  CustomerCreateSchema,
  CustomerListQuerySchema,
  CustomerMergeSchema,
  CustomerUpdateSchema,
} from "@dealpilot/shared";
import {
  createCustomer,
  getCustomer,
  listCustomers,
  mergeCustomers,
  restoreCustomer,
  softDeleteCustomer,
  updateCustomer,
} from "../services/customer-service";

const app = new Hono();

app.get("/customers", async (c) => {
  const query = CustomerListQuerySchema.parse({
    cursor: c.req.query("cursor"),
    limit: c.req.query("limit") ?? "20",
    search: c.req.query("search"),
    grade: c.req.query("grade"),
    status: c.req.query("status"),
    sort: c.req.query("sort") ?? "created_at",
  });
  return c.json(await listCustomers(query));
});

app.post("/customers", zValidator("json", CustomerCreateSchema), async (c) => {
  return c.json(await createCustomer(c.req.valid("json")), 201);
});

app.get("/customers/:id", async (c) => {
  return c.json(await getCustomer(c.req.param("id")));
});

app.put("/customers/:id", zValidator("json", CustomerUpdateSchema), async (c) => {
  return c.json(await updateCustomer(c.req.param("id"), c.req.valid("json")));
});

app.delete("/customers/:id", async (c) => {
  await softDeleteCustomer(c.req.param("id"));
  return c.body(null, 204);
});

app.post("/customers/:id/restore", async (c) => {
  return c.json(await restoreCustomer(c.req.param("id")));
});

app.post("/customers/merge", zValidator("json", CustomerMergeSchema), async (c) => {
  return c.json(await mergeCustomers(c.req.valid("json")));
});

export default app;
