import { Hono } from "hono";
import {
  SocialAccountCreateSchema,
  SocialAccountListQuerySchema,
} from "@dealpilot/shared";
import { validateJson, validateQuery } from "../middleware/validation";
import {
  createSocialAccount,
  deleteSocialAccount,
  getSocialAccounts,
  listSocialAccountsPage,
} from "../services/social-account-service";

const app = new Hono();

app.get(
  "/social-accounts",
  validateQuery(SocialAccountListQuerySchema),
  async (c) => c.json(await listSocialAccountsPage(c.req.valid("query"))),
);

app.get("/customers/:id/social-accounts", async (c) => {
  return c.json(await getSocialAccounts(c.req.param("id")));
});

app.post(
  "/customers/:id/social-accounts",
  validateJson(SocialAccountCreateSchema),
  async (c) =>
    c.json(
      await createSocialAccount(c.req.param("id"), c.req.valid("json")),
      201,
    ),
);

app.delete("/social-accounts/:id", async (c) => {
  await deleteSocialAccount(c.req.param("id"));
  return c.body(null, 204);
});

export default app;
