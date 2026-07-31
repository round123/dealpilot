/**
 * DealPilot 联系人 Zod schema
 */

import { z } from "zod";
import { CursorPaginationSchema, UUIDSchema } from "./common.js";

export const ContactListQuerySchema = CursorPaginationSchema.extend({
  cursor: UUIDSchema.optional(),
  customer_id: UUIDSchema.optional(),
});

export const ContactCreateSchema = z.object({
  name: z.string().min(1, "联系人名称不能为空").max(200),
  title: z.string().max(200).optional(),
  email: z.string().email("邮箱格式不正确").optional().or(z.literal("")),
  phone: z.string().max(50).optional(),
});

export const ContactUpdateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  title: z.string().max(200).optional(),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().max(50).optional(),
});

export const ContactSchema = z.object({
  id: UUIDSchema,
  customer_id: UUIDSchema,
  name: z.string(),
  title: z.string().nullable(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  created_at: z.string(),
});
