/**
 * DealPilot 会话身份匹配 Zod schema
 */

import { z } from "zod";
import { UUIDSchema } from "./common.js";
import { Platform, MatchStatus } from "../types/enums.js";
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

export const MatchResolveResponseSchema = z.object({
  status: z.enum([MatchStatus.UNIQUE, MatchStatus.MULTIPLE, MatchStatus.NONE]),
  customer: CustomerSchema.optional(),
  candidates: z.array(CustomerSchema).optional(),
});

export const BindingSchema = z.object({
  id: UUIDSchema,
  customer_id: UUIDSchema,
  platform: z.string(),
  raw_identifier: z.string(),
  normalized_identifier: z.string(),
  manually_bound: z.boolean(),
  created_at: z.string(),
});
