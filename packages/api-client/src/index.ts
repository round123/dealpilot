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
  CustomerDealSchema,
  CustomerDetailSchema,
  CustomerFollowUpSchema,
  CustomerMergeFieldResolutionsSchema,
  CustomerMergeChoiceSchema,
  CustomerMergeChoicesSchema,
  CustomerReminderSchema,
  CustomerSchema,
  CustomerSocialAccountSchema,
  CustomerSummarySchema,
  ResolvedCustomerMergeFieldsSchema,
} from "./customer.js";
export type {
  Customer,
  CustomerApi,
  CustomerContact,
  CustomerDeal,
  CustomerDetail,
  CustomerFollowUp,
  CustomerMergeChoice,
  CustomerMergeChoices,
  CustomerMergeFieldResolutions,
  CustomerReminder,
  CustomerSocialAccount,
  CustomerSummary,
  JsonValue,
  MergeCustomersInput,
  ResolvedCustomerMergeFields,
} from "./customer.js";
export {
  ContactIdSchema,
  CustomerIdSchema,
  DealIdSchema,
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
  EntityId,
  FollowUpId,
  ReminderId,
  SocialAccountId,
  UserId,
} from "./ids.js";
