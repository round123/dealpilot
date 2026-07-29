/**
 * DealPilot 路由 - Matches
 * POST /matches/resolve, POST/DELETE /matches/bind
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import {
  MatchResolveSchema,
  MatchBindSchema,
  MatchUnbindSchema,
} from "@dealpilot/shared";
import {
  resolveMatch,
  bindMatch,
  unbindMatch,
} from "../services/match-service";

const app = new Hono();

// POST /matches/resolve - 会话身份匹配
app.post("/matches/resolve", zValidator("json", MatchResolveSchema), async (c) => {
  const body = c.req.valid("json");
  const result = await resolveMatch(body);
  return c.json(result);
});

// POST /matches/bind - 人工绑定会话到客户
app.post("/matches/bind", zValidator("json", MatchBindSchema), async (c) => {
  const body = c.req.valid("json");
  const result = await bindMatch(body);
  return c.json(result, 201);
});

// DELETE /matches/bind - 解绑
app.delete("/matches/bind", zValidator("json", MatchUnbindSchema), async (c) => {
  const body = c.req.valid("json");
  await unbindMatch(body.platform, body.raw_identifier);
  return c.body(null, 204);
});

export default app;
