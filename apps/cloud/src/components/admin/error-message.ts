const ERROR_CODE_MESSAGE_KEYS: Readonly<Record<string, string>> = {
  ABORTED: "errors.aborted",
  NETWORK_ERROR: "errors.network",
  INVALID_RESPONSE: "errors.invalidResponse",
  UNAUTHORIZED: "errors.unauthorized",
  FORBIDDEN: "errors.forbidden",
  NOT_FOUND: "errors.notFound",
  CONFLICT: "errors.conflict",
  VALIDATION_ERROR: "errors.validation",
  RATE_LIMITED: "errors.rateLimited",
  FUNCTION_ERROR: "errors.function",
  STORAGE_ERROR: "errors.storage",
  SERVER_ERROR: "errors.server",
};

const TRANSLATION_KEY = /^[a-z][\w-]*(?:\.[\w-]+)+$/i;
const INVALID_CREDENTIALS =
  /invalid (?:login )?credentials|invalid email or password/i;
const EXPIRED_SESSION =
  /auth session missing|authentication required|invalid refresh token|refresh token not found|jwt expired|token.*expired/i;
const NETWORK_FAILURE =
  /failed to fetch|network(?:error| request failed)|load failed|econn(?:refused|reset)|enotfound|fetch failed/i;

type ErrorDetails = {
  code?: unknown;
  status?: unknown;
  message?: unknown;
};

export const getErrorMessageKey = (
  error: unknown,
  fallbackKey = "errors.generic",
): string => {
  const details = getErrorDetails(error);
  const code = typeof details.code === "string" ? details.code : undefined;
  if (code && ERROR_CODE_MESSAGE_KEYS[code]) {
    return ERROR_CODE_MESSAGE_KEYS[code];
  }

  if (details.status === 401) return "errors.unauthorized";

  const message =
    typeof details.message === "string" ? details.message.trim() : "";
  if (TRANSLATION_KEY.test(message)) return message;
  if (INVALID_CREDENTIALS.test(message)) return "crm.auth.invalid_credentials";
  if (EXPIRED_SESSION.test(message)) return "errors.unauthorized";
  if (NETWORK_FAILURE.test(message)) return "errors.network";

  return fallbackKey;
};

const getErrorDetails = (error: unknown): ErrorDetails => {
  if (typeof error === "string") return { message: error };
  if (typeof error === "object" && error !== null) {
    return error as ErrorDetails;
  }
  return {};
};
