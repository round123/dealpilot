/**
 * DealPilot 会话身份匹配 Zod schema
 */

import { z } from "zod";
import { UUIDSchema } from "./common.js";
import { Platform, MatchMethod, MatchStatus } from "../types/enums.js";
import { CustomerSchema } from "./customer.js";

export const MatchResolveSchema = z.object({
  platform: z.enum([Platform.WHATSAPP, Platform.TELEGRAM]),
  raw_identifier: z.string().min(1),
});

export const MatchBindSchema = z.object({
  platform: z.enum([Platform.WHATSAPP, Platform.TELEGRAM]),
  raw_identifier: z.string().min(1),
  customer_id: UUIDSchema,
});

export const MatchUnbindSchema = z.object({
  platform: z.enum([Platform.WHATSAPP, Platform.TELEGRAM]),
  raw_identifier: z.string().min(1),
});

const MatchMethodSchema = z.enum([
  MatchMethod.MANUAL,
  MatchMethod.PHONE,
  MatchMethod.PLATFORM,
]);

export const MatchResolveResponseSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal(MatchStatus.UNIQUE),
    match_method: MatchMethodSchema,
    customer: CustomerSchema,
  }),
  z.object({
    status: z.literal(MatchStatus.MULTIPLE),
    match_method: MatchMethodSchema,
    candidates: z.array(CustomerSchema),
  }),
  z.object({
    status: z.literal(MatchStatus.NONE),
    match_method: z.null(),
  }),
]);

export const BindingSchema = z.object({
  id: UUIDSchema,
  customer_id: UUIDSchema,
  platform: z.string(),
  raw_identifier: z.string(),
  normalized_identifier: z.string(),
  manually_bound: z.boolean(),
  created_at: z.string(),
});
