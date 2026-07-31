/**
 * DealPilot 项目 Zod schema
 */

import { z } from "zod";
import { UUIDSchema } from "./common.js";
import { MilestoneSchema } from "./milestone.js";
import { RiskSchema } from "./risk.js";
import { ProjectStage, ProjectGrade } from "../types/enums.js";

export const ProjectCreateSchema = z.object({
  customer_id: UUIDSchema,
  name: z.string().min(1, "项目名称不能为空").max(200),
  currency: z.string().length(3).default("USD"),
  amount: z.number().min(0).optional(),
  probability: z.number().int().min(0).max(100).optional(),
  expected_close_date: z.string().optional(),
  stage: z.enum([
    ProjectStage.LEAD,
    ProjectStage.QUALIFIED,
    ProjectStage.PROPOSAL,
    ProjectStage.NEGOTIATION,
    ProjectStage.CLOSED_WON,
    ProjectStage.CLOSED_LOST,
    ProjectStage.ARCHIVED,
  ]).optional().default(ProjectStage.LEAD),
  grade: z.enum([ProjectGrade.S, ProjectGrade.A, ProjectGrade.B, ProjectGrade.C]).default(ProjectGrade.B),
  closed_reason: z.string().nullable().optional(),
});

export const ProjectUpdateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  currency: z.string().length(3).optional(),
  amount: z.number().min(0).optional(),
  probability: z.number().int().min(0).max(100).optional(),
  expected_close_date: z.string().optional(),
  stage: z.enum([
    ProjectStage.LEAD,
    ProjectStage.QUALIFIED,
    ProjectStage.PROPOSAL,
    ProjectStage.NEGOTIATION,
    ProjectStage.CLOSED_WON,
    ProjectStage.CLOSED_LOST,
    ProjectStage.ARCHIVED,
  ]).optional(),
  grade: z.enum([ProjectGrade.S, ProjectGrade.A, ProjectGrade.B, ProjectGrade.C]).optional(),
  closed_reason: z.string().nullable().optional(),
});

export const ProjectStageUpdateSchema = z.object({
  stage: z.enum([
    ProjectStage.LEAD,
    ProjectStage.QUALIFIED,
    ProjectStage.PROPOSAL,
    ProjectStage.NEGOTIATION,
    ProjectStage.CLOSED_WON,
    ProjectStage.CLOSED_LOST,
    ProjectStage.ARCHIVED,
  ]),
});

export const ProjectSchema = z.object({
  id: UUIDSchema,
  customer_id: UUIDSchema,
  name: z.string(),
  currency: z.string(),
  amount: z.number().nullable(),
  probability: z.number().nullable(),
  expected_close_date: z.string().nullable(),
  stage: z.string(),
  grade: z.string(),
  closed_reason: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const ProjectDetailSchema = ProjectSchema.extend({
  risks: z.array(RiskSchema).optional(),
  milestones: z.array(MilestoneSchema).optional(),
  open_reminders: z.array(z.object({
    id: UUIDSchema,
    type: z.string(),
    status: z.string(),
    due_at: z.string(),
  })).optional(),
});

export const ProjectListQuerySchema = z.object({
  customer_id: UUIDSchema.optional(),
  stage: z.enum([
    ProjectStage.LEAD,
    ProjectStage.QUALIFIED,
    ProjectStage.PROPOSAL,
    ProjectStage.NEGOTIATION,
    ProjectStage.CLOSED_WON,
    ProjectStage.CLOSED_LOST,
    ProjectStage.ARCHIVED,
  ]).optional(),
  grade: z.enum([ProjectGrade.S, ProjectGrade.A, ProjectGrade.B, ProjectGrade.C]).optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
