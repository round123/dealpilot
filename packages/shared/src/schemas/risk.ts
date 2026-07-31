/**
 * DealPilot 风险 Zod schema
 */

import { z } from "zod";
import {
  CursorPaginationSchema,
  DateTimeSchema,
  UUIDSchema,
} from "./common.js";
import { RiskSeverity, RiskStatus } from "../types/enums.js";

export const RiskListQuerySchema = CursorPaginationSchema.extend({
  cursor: UUIDSchema.optional(),
  project_id: UUIDSchema.optional(),
});

export const RiskCreateSchema = z.object({
  description: z.string().min(1, "风险描述不能为空").max(1000),
  severity: z.enum([
    RiskSeverity.LOW,
    RiskSeverity.MEDIUM,
    RiskSeverity.HIGH,
    RiskSeverity.CRITICAL,
  ]),
  status: z
    .enum([
      RiskStatus.OPEN,
      RiskStatus.HANDLING,
      RiskStatus.RESOLVED,
      RiskStatus.IGNORED,
    ])
    .optional()
    .default(RiskStatus.OPEN),
  handled_at: DateTimeSchema.nullable().optional(),
});

export const RiskUpdateSchema = z.object({
  description: z.string().min(1, "风险描述不能为空").max(1000).optional(),
  severity: z
    .enum([
      RiskSeverity.LOW,
      RiskSeverity.MEDIUM,
      RiskSeverity.HIGH,
      RiskSeverity.CRITICAL,
    ])
    .optional(),
  status: z
    .enum([
      RiskStatus.OPEN,
      RiskStatus.HANDLING,
      RiskStatus.RESOLVED,
      RiskStatus.IGNORED,
    ])
    .optional(),
  handled_at: DateTimeSchema.nullable().optional(),
});

export const RiskSchema = z.object({
  id: UUIDSchema,
  project_id: UUIDSchema,
  description: z.string(),
  severity: z.string(),
  status: z.string(),
  handled_at: z.string().nullable(),
  created_at: z.string(),
});
