import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { SocialAccountCreateSchema } from "@dealpilot/shared";
import {
  createSocialAccount,
  deleteSocialAccount,
  getSocialAccounts,
} from "../services/social-account-service";

const app = new Hono();

app.get("/customers/:id/social-accounts", async (c) => {
  return c.json(await getSocialAccounts(c.req.param("id")));
});

app.post(
  "/customers/:id/social-accounts",
  zValidator("json", SocialAccountCreateSchema),
  async (c) => c.json(
    await createSocialAccount(c.req.param("id"), c.req.valid("json")),
    201,
  ),
);

app.delete("/social-accounts/:id", async (c) => {
  await deleteSocialAccount(c.req.param("id"));
  return c.body(null, 204);
});

export default app;
