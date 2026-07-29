/**
 * DealPilot 跟进记录 Zod schema
 */

import { z } from "zod";
import { UUIDSchema, DateTimeSchema } from "./common.js";
import { FollowUpType, MessageDirection } from "../types/enums.js";

export const FollowUpCreateSchema = z.object({
  customer_id: UUIDSchema,
  project_id: UUIDSchema.optional(),
  type: z.enum([
    FollowUpType.CALL,
    FollowUpType.EMAIL,
    FollowUpType.CHAT,
    FollowUpType.VISIT,
    FollowUpType.NOTE,
    FollowUpType.MESSAGE,
  ]),
  note: z.string().max(5000).optional(),
  message_body: z.string().max(10000).optional(),
  message_direction: z.enum([MessageDirection.INBOUND, MessageDirection.OUTBOUND]).optional(),
  occurred_at: DateTimeSchema.optional().default(() => new Date().toISOString()),
});

export const FollowUpUpdateSchema = z.object({
  type: z.enum([
    FollowUpType.CALL,
    FollowUpType.EMAIL,
    FollowUpType.CHAT,
    FollowUpType.VISIT,
    FollowUpType.NOTE,
    FollowUpType.MESSAGE,
  ]).optional(),
  note: z.string().max(5000).optional(),
  message_body: z.string().max(10000).optional(),
  message_direction: z.enum([MessageDirection.INBOUND, MessageDirection.OUTBOUND]).optional(),
  occurred_at: DateTimeSchema.optional(),
});

export const FollowUpSchema = z.object({
  id: UUIDSchema,
  customer_id: UUIDSchema,
  project_id: UUIDSchema.nullable(),
  type: z.string(),
  note: z.string().nullable(),
  message_body: z.string().nullable(),
  message_direction: z.string().nullable(),
  occurred_at: z.string(),
  created_at: z.string(),
});

export const FollowUpListQuerySchema = z.object({
  customer_id: UUIDSchema.optional(),
  project_id: UUIDSchema.optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
