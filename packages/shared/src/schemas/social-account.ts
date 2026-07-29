/**
 * DealPilot 社媒账号 Zod schema
 */

import { z } from "zod";
import { UUIDSchema } from "./common.js";
import { Platform } from "../types/enums.js";

export const SocialAccountCreateSchema = z.object({
  platform: z.enum([Platform.WHATSAPP, Platform.TELEGRAM]),
  raw_identifier: z.string().min(1),
  contact_id: UUIDSchema.optional(),
});

export const SocialAccountSchema = z.object({
  id: UUIDSchema,
  customer_id: UUIDSchema,
  contact_id: UUIDSchema.nullable(),
  platform: z.string(),
  raw_identifier: z.string(),
  normalized_identifier: z.string(),
  manually_bound: z.boolean(),
  created_at: z.string(),
});
