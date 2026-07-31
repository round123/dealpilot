/**
 * DealPilot 客户相关 Zod schema
 * 前后端共享：后端 zValidator 校验请求体，前端 RHF + zodResolver 校验表单
 */

import { z } from "zod";
import { CustomerGrade, CustomerStatus } from "../types/enums.js";
import { UUIDSchema, DateTimeSchema } from "./common.js";

/**
 * 客户创建
 */
export const CustomerCreateSchema = z.object({
  name: z.string().min(1, "客户名称不能为空").max(200),
  company: z.string().max(200).optional(),
  country: z.string().max(100).optional(),
  source: z.string().max(100).optional(),
  grade: z.enum([CustomerGrade.A, CustomerGrade.B, CustomerGrade.C]).default(CustomerGrade.B),
  status: z.enum([CustomerStatus.ACTIVE, CustomerStatus.INACTIVE]).default(CustomerStatus.ACTIVE),
});

/**
 * 客户更新（全部可选）
 */
export const CustomerUpdateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  company: z.string().max(200).optional(),
  country: z.string().max(100).optional(),
  source: z.string().max(100).optional(),
  grade: z.enum([CustomerGrade.A, CustomerGrade.B, CustomerGrade.C]).optional(),
  status: z.enum([CustomerStatus.ACTIVE, CustomerStatus.INACTIVE]).optional(),
});

/**
 * 客户响应
 */
export const CustomerSchema = z.object({
  id: UUIDSchema,
  name: z.string(),
  company: z.string().nullable(),
  country: z.string().nullable(),
  source: z.string().nullable(),
  grade: z.enum([CustomerGrade.A, CustomerGrade.B, CustomerGrade.C]),
  status: z.enum([CustomerStatus.ACTIVE, CustomerStatus.INACTIVE]),
  deleted_at: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

/**
 * 客户详情（含关联数据摘要）
 */
export const CustomerDetailSchema = CustomerSchema.extend({
  contacts: z.array(z.object({
    id: UUIDSchema,
    name: z.string(),
    title: z.string().nullable(),
    email: z.string().nullable(),
    phone: z.string().nullable(),
  })).optional(),
  social_accounts: z.array(z.object({
    id: UUIDSchema,
    platform: z.string(),
    raw_identifier: z.string(),
  })).optional(),
  recent_follow_ups: z.array(z.object({
    id: UUIDSchema,
    type: z.string(),
    note: z.string().nullable(),
    occurred_at: z.string(),
  })).optional(),
  open_reminders: z.array(z.object({
    id: UUIDSchema,
    type: z.string(),
    status: z.string(),
    due_at: z.string(),
  })).optional(),
  projects: z.array(z.object({
    id: UUIDSchema,
    name: z.string(),
    stage: z.string(),
    amount: z.number().nullable(),
  })).optional(),
});

/**
 * 客户列表查询参数
 */
export const CustomerListQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional(),
  grade: z.enum([CustomerGrade.A, CustomerGrade.B, CustomerGrade.C]).optional(),
  status: z.enum([CustomerStatus.ACTIVE, CustomerStatus.INACTIVE]).optional(),
  sort: z.enum(["name", "created_at", "updated_at", "grade"]).optional().default("created_at"),
});

export const CustomerDeletedListQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

/**
 * 客户合并
 */
export const CustomerMergeSchema = z.object({
  source_id: UUIDSchema,
  target_id: UUIDSchema,
  field_resolutions: z.record(z.string(), z.enum(["source", "target"])).optional(),
});
