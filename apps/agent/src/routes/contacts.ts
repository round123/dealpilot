import { Hono } from "hono";
import {
  ContactCreateSchema,
  ContactListQuerySchema,
  ContactUpdateSchema,
} from "@dealpilot/shared";
import { validateJson, validateQuery } from "../middleware/validation";
import {
  createContact,
  deleteContact,
  getContacts,
  listContactsPage,
  updateContact,
} from "../services/contact-service";

const app = new Hono();

app.get("/contacts", validateQuery(ContactListQuerySchema), async (c) =>
  c.json(await listContactsPage(c.req.valid("query"))),
);

app.get("/customers/:id/contacts", async (c) => {
  return c.json(await getContacts(c.req.param("id")));
});

app.post(
  "/customers/:id/contacts",
  validateJson(ContactCreateSchema),
  async (c) => {
    return c.json(
      await createContact(c.req.param("id"), c.req.valid("json")),
      201,
    );
  },
);

app.put("/contacts/:id", validateJson(ContactUpdateSchema), async (c) => {
  return c.json(await updateContact(c.req.param("id"), c.req.valid("json")));
});

app.delete("/contacts/:id", async (c) => {
  await deleteContact(c.req.param("id"));
  return c.body(null, 204);
});

export default app;
