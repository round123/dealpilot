export type { ApiClientConfig } from "./config.js";
export type {
  ApiEnvelope,
  ApiErrorBody,
  ApiErrorEnvelope,
  ApiSuccessEnvelope,
} from "./contracts.js";
export { API_ERROR_CODES, ApiError } from "./error.js";
export type {
  ApiErrorOptions,
  BuiltInApiErrorCode,
  FieldErrors,
} from "./error.js";
export { createApiClient } from "./gateway.js";
export type {
  ApiClient,
  ApiRequestOptions,
  ByIdOptions,
  EdgeFunctionOptions,
  FilterContainsValue,
  FilterOperator,
  FilterScalar,
  ListOptions,
  ListResult,
  ListSort,
  MutationOptions,
  ResourceFilterValue,
  ResourceFilters,
  StructuredFilter,
} from "./gateway.js";
export type {
  AuthApi,
  AuthChangeEvent,
  AuthRequestOptions,
  AuthSession,
  AuthStateListener,
  AuthSubscription,
  AuthUser,
  ResetPasswordOptions,
  SignUpOptions,
  SignUpResult,
} from "./auth.js";
export {
  BackupCreateInputSchema,
  BackupExportSchema,
  BackupPayloadRestoreInputSchema,
  BackupRestoreResultSchema,
  BackupSnapshotSchema,
  createBackupApi,
} from "./backup.js";
export type {
  BackupApi,
  BackupCreateInput,
  BackupExport,
  BackupPayloadRestoreInput,
  BackupRestoreResult,
  BackupSnapshot,
} from "./backup.js";
export type {
  PrivateStorageApi,
  SignedStorageUrl,
  SignedUrlOptions,
  StorageRequestOptions,
  StorageTransformOptions,
  StorageUploadBody,
  StorageUploadOptions,
  StoredObject,
} from "./storage.js";
export {
  createCustomerApi,
  resolveCustomerMergeFields,
  CustomerContactSchema,
  CustomerCursorPageInputSchema,
  CustomerCursorPageSchema,
  CustomerCursorSortFieldSchema,
  DEAL_STAGE_VALUES,
  DealStageSchema,
  CustomerDealSchema,
  CustomerDetailSchema,
  CustomerFollowUpSchema,
  FollowUpCreateInputSchema,
  FollowUpUpdateInputSchema,
  CustomerMergeFieldResolutionsSchema,
  CustomerMergeChoiceSchema,
  CustomerMergeChoicesSchema,
  CustomerReminderSchema,
  ReminderCreateInputSchema,
  ReminderUpdateInputSchema,
  CustomerSchema,
  CustomerSocialAccountSchema,
  CustomerSummarySchema,
  ResolvedCustomerMergeFieldsSchema,
} from "./customer.js";
export {
  CloudImportCommitInputSchema,
  CloudImportCommitResultSchema,
  CloudImportResolutionSchema,
  CloudImportRowSchema,
  CloudImportWarningSchema,
  createImportApi,
} from "./import.js";
export {
  createReminderApi,
  ReminderStatusMutationInputSchema,
} from "./reminder.js";
export type { ReminderApi, ReminderStatusMutationInput } from "./reminder.js";
export {
  createDealApi,
  DealCreateWithContactsInputSchema,
  DealUpdateWithContactsInputSchema,
  DealWithContactsRpcDataSchema,
} from "./deal.js";
export type {
  DealApi,
  DealCreateWithContactsInput,
  DealUpdateWithContactsInput,
  DealWithContacts,
} from "./deal.js";
export type {
  CloudImportCommitInput,
  CloudImportCommitResult,
  CloudImportResolution,
  CloudImportRow,
  ImportApi,
} from "./import.js";
export type {
  Customer,
  CustomerApi,
  CustomerContact,
  CustomerCursorPage,
  CustomerCursorPageInput,
  CustomerCursorSortField,
  DealStage,
  CustomerDeal,
  CustomerDetail,
  CustomerFollowUp,
  FollowUpCreateInput,
  FollowUpUpdateInput,
  CustomerMergeChoice,
  CustomerMergeChoices,
  CustomerMergeFieldResolutions,
  CustomerReminder,
  ReminderCreateInput,
  ReminderUpdateInput,
  CustomerSocialAccount,
  CustomerSummary,
  JsonValue,
  MergeCustomersInput,
  ResolvedCustomerMergeFields,
} from "./customer.js";
export {
  createDashboardApi,
  DashboardPriorityReminderSchema,
  DashboardSummarySchema,
} from "./dashboard.js";
export type {
  DashboardApi,
  DashboardPriorityReminder,
  DashboardSummary,
} from "./dashboard.js";
export {
  ContactIdSchema,
  CustomerIdSchema,
  DealIdSchema,
  DealMilestoneIdSchema,
  DealRiskIdSchema,
  FollowUpIdSchema,
  ReminderIdSchema,
  SocialAccountIdSchema,
  UserIdSchema,
  entityIdSchema,
  toEntityId,
} from "./ids.js";
export type {
  ContactId,
  CustomerId,
  DealId,
  DealMilestoneId,
  DealRiskId,
  EntityId,
  FollowUpId,
  ReminderId,
  SocialAccountId,
  UserId,
} from "./ids.js";
export {
  DealMilestoneSchema,
  DealRiskSchema,
  MILESTONE_REMINDER_PREFIX,
  getDealRiskPriorityWeight,
  getMilestoneReminderDueAt,
  milestoneReminderKey,
} from "./deal-domain.js";
export type { DealMilestone, DealRisk } from "./deal-domain.js";
export {
  CloudPrdResourceSchemas,
  ContactCreateInputSchema,
  ContactSummarySchema,
  ContactTagIdsSchema,
  ContactTagSchema,
  ContactUpdateInputSchema,
  CustomerCreateInputSchema,
  CustomerUpdateInputSchema,
  DealContactIdsSchema,
  DealContactSchema,
  DealCreateInputSchema,
  DealUpdateInputSchema,
  LegacyAtomicRecordSchema,
  cloudRecordSchemaFor,
  isCloudPrdResource,
  toContactCreateInput,
  toContactUpdateInput,
  toCustomerCreateInput,
  toCustomerUpdateInput,
  toDealCreateInput,
  toDealUpdateInput,
} from "./resource-contracts.js";
export type {
  CloudPrdResourceName,
  ContactCreateInput,
  ContactSummary,
  ContactTag,
  ContactUpdateInput,
  CustomerCreateInput,
  CustomerUpdateInput,
  DealContact,
  DealCreateInput,
  DealUpdateInput,
} from "./resource-contracts.js";
