/**
 * DealPilot API 请求/响应类型（从 Zod 推导）
 */

import { z } from "zod";
import {
  CustomerSchema,
  CustomerCreateSchema,
  CustomerUpdateSchema,
  CustomerDetailSchema,
  CustomerListQuerySchema,
  CustomerDeletedListQuerySchema,
  CustomerMergeSchema,
} from "../schemas/customer.js";
import {
  ContactSchema,
  ContactCreateSchema,
  ContactUpdateSchema,
  ContactListQuerySchema,
} from "../schemas/contact.js";
import {
  SocialAccountSchema,
  SocialAccountCreateSchema,
  SocialAccountListQuerySchema,
} from "../schemas/social-account.js";
import {
  FollowUpSchema,
  FollowUpCreateSchema,
  FollowUpUpdateSchema,
  FollowUpListQuerySchema,
} from "../schemas/follow-up.js";
import {
  ReminderSchema,
  PopupReminderSchema,
  ReminderCreateSchema,
  ReminderStatusUpdateSchema,
  ReminderListQuerySchema,
} from "../schemas/reminder.js";
import {
  ProjectSchema,
  ProjectDetailSchema,
  ProjectCreateSchema,
  ProjectUpdateSchema,
  ProjectStageUpdateSchema,
  ProjectListQuerySchema,
} from "../schemas/project.js";
import {
  RiskSchema,
  RiskCreateSchema,
  RiskUpdateSchema,
  RiskListQuerySchema,
} from "../schemas/risk.js";
import {
  MilestoneSchema,
  MilestoneCreateSchema,
  MilestoneUpdateSchema,
  MilestoneListQuerySchema,
} from "../schemas/milestone.js";
import {
  MatchResolveSchema,
  MatchBindSchema,
  MatchUnbindSchema,
  MatchResolveResponseSchema,
  BindingSchema,
} from "../schemas/match.js";
import {
  ImportCommitRequestSchema,
  ImportParseResponseSchema,
  ImportCommitResponseSchema,
} from "../schemas/import.js";
import { SettingsSchema, SettingsUpdateSchema } from "../schemas/settings.js";
import {
  BackupCreateSchema,
  BackupValidateResponseSchema,
  BackupRestoreResponseSchema,
} from "../schemas/backup.js";
import { StatsSchema } from "../schemas/stats.js";
import {
  ClearLocalDataResponseSchema,
  ClearLocalDataSchema,
  LocalDataInfoSchema,
} from "../schemas/system.js";

// Customer
export type Customer = z.infer<typeof CustomerSchema>;
export type CustomerCreate = z.infer<typeof CustomerCreateSchema>;
export type CustomerUpdate = z.infer<typeof CustomerUpdateSchema>;
export type CustomerDetail = z.infer<typeof CustomerDetailSchema>;
export type CustomerListQuery = z.infer<typeof CustomerListQuerySchema>;
export type CustomerDeletedListQuery = z.infer<
  typeof CustomerDeletedListQuerySchema
>;
export type CustomerMerge = z.infer<typeof CustomerMergeSchema>;

// Contact
export type Contact = z.infer<typeof ContactSchema>;
export type ContactCreate = z.infer<typeof ContactCreateSchema>;
export type ContactUpdate = z.infer<typeof ContactUpdateSchema>;
export type ContactListQuery = z.infer<typeof ContactListQuerySchema>;

// SocialAccount
export type SocialAccount = z.infer<typeof SocialAccountSchema>;
export type SocialAccountCreate = z.infer<typeof SocialAccountCreateSchema>;
export type SocialAccountListQuery = z.infer<
  typeof SocialAccountListQuerySchema
>;

// FollowUp
export type FollowUp = z.infer<typeof FollowUpSchema>;
export type FollowUpCreate = z.infer<typeof FollowUpCreateSchema>;
export type FollowUpUpdate = z.infer<typeof FollowUpUpdateSchema>;
export type FollowUpListQuery = z.infer<typeof FollowUpListQuerySchema>;

// Reminder
export type Reminder = z.infer<typeof ReminderSchema>;
export type PopupReminder = z.infer<typeof PopupReminderSchema>;
export type ReminderCreate = z.infer<typeof ReminderCreateSchema>;
export type ReminderStatusUpdate = z.infer<typeof ReminderStatusUpdateSchema>;
export type ReminderListQuery = z.infer<typeof ReminderListQuerySchema>;

// Project
export type Project = z.infer<typeof ProjectSchema>;
export type ProjectDetail = z.infer<typeof ProjectDetailSchema>;
export type ProjectCreate = z.infer<typeof ProjectCreateSchema>;
export type ProjectUpdate = z.infer<typeof ProjectUpdateSchema>;
export type ProjectStageUpdate = z.infer<typeof ProjectStageUpdateSchema>;
export type ProjectListQuery = z.infer<typeof ProjectListQuerySchema>;

// Risk
export type Risk = z.infer<typeof RiskSchema>;
export type RiskCreate = z.infer<typeof RiskCreateSchema>;
export type RiskUpdate = z.infer<typeof RiskUpdateSchema>;
export type RiskListQuery = z.infer<typeof RiskListQuerySchema>;

// Milestone
export type Milestone = z.infer<typeof MilestoneSchema>;
export type MilestoneCreate = z.infer<typeof MilestoneCreateSchema>;
export type MilestoneUpdate = z.infer<typeof MilestoneUpdateSchema>;
export type MilestoneListQuery = z.infer<typeof MilestoneListQuerySchema>;

// Match
export type MatchResolve = z.infer<typeof MatchResolveSchema>;
export type MatchBind = z.infer<typeof MatchBindSchema>;
export type MatchUnbind = z.infer<typeof MatchUnbindSchema>;
export type MatchResolveResponse = z.infer<typeof MatchResolveResponseSchema>;
export type Binding = z.infer<typeof BindingSchema>;

// Import
export type ImportCommitRequest = z.infer<typeof ImportCommitRequestSchema>;
export type ImportParseResponse = z.infer<typeof ImportParseResponseSchema>;
export type ImportCommitResponse = z.infer<typeof ImportCommitResponseSchema>;

// Settings
export type Settings = z.infer<typeof SettingsSchema>;
export type SettingsUpdate = z.infer<typeof SettingsUpdateSchema>;

// Backup
export type BackupCreate = z.infer<typeof BackupCreateSchema>;
export type BackupValidateResponse = z.infer<
  typeof BackupValidateResponseSchema
>;
export type BackupRestoreResponse = z.infer<typeof BackupRestoreResponseSchema>;

// Stats
export type Stats = z.infer<typeof StatsSchema>;

// Local data lifecycle
export type LocalDataInfo = z.infer<typeof LocalDataInfoSchema>;
export type ClearLocalData = z.infer<typeof ClearLocalDataSchema>;
export type ClearLocalDataResponse = z.infer<
  typeof ClearLocalDataResponseSchema
>;
