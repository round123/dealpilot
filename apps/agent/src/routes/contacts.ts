import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { ContactCreateSchema, ContactUpdateSchema } from "@dealpilot/shared";
import {
  createContact,
  deleteContact,
  getContacts,
  updateContact,
} from "../services/contact-service";

const app = new Hono();

app.get("/customers/:id/contacts", async (c) => {
  return c.json(await getContacts(c.req.param("id")));
});

app.post("/customers/:id/contacts", zValidator("json", ContactCreateSchema), async (c) => {
  return c.json(await createContact(c.req.param("id"), c.req.valid("json")), 201);
});

app.put("/contacts/:id", zValidator("json", ContactUpdateSchema), async (c) => {
  return c.json(await updateContact(c.req.param("id"), c.req.valid("json")));
});

app.delete("/contacts/:id", async (c) => {
  await deleteContact(c.req.param("id"));
  return c.body(null, 204);
});

export default app;
