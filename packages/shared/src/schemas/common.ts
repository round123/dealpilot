/**
 * DealPilot 通用 Zod schema
 * 游标分页、错误响应等通用结构
 */

import { z } from "zod";

/**
 * 游标分页请求参数
 */
export const CursorPaginationSchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

/**
 * 游标分页响应
 */
export function paginatedResponse<T extends z.ZodTypeAny>(itemSchema: T) {
  return z.object({
    items: z.array(itemSchema),
    next_cursor: z.string().nullable(),
  });
}

/**
 * 统一错误响应
 */
export const ErrorResponseSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    fields: z.record(z.array(z.string())).optional(),
    details: z.any().optional(),
    request_id: z.string().optional(),
  }),
});

/**
 * UUID 字符串校验
 */
export const UUIDSchema = z.string().uuid();

/**
 * ISO 8601 日期时间字符串
 */
export const DateTimeSchema = z.string().datetime({ local: true }).or(z.string().datetime());

/**
 * 幂等键请求头
 */
export const IdempotencyKeyHeader = z.object({
  "Idempotency-Key": z.string().min(1),
});

/**
 * API 成功响应包装
 */
export const SuccessResponseSchema = z.object({
  success: z.boolean(),
  message: z.string().optional(),
});

/**
 * 排序参数
 */
export const SortParamSchema = z.object({
  sort: z.string().optional(),
  sort_order: z.enum(["asc", "desc"]).optional().default("asc"),
});
