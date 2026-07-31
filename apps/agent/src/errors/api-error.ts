export type ApiErrorStatus = 400 | 401 | 403 | 404 | 409;

export class ApiError extends Error {
  constructor(
    public status: ApiErrorStatus,
    public code: string,
    message: string,
    public details?: unknown,
    public fields?: Record<string, string[]>,
  ) {
    super(message);
    this.name = "ApiError";
  }

  static badRequest(message: string, details?: unknown) {
    return new ApiError(400, "BAD_REQUEST", message, details);
  }

  static validation(
    fields: Record<string, string[]>,
    message = "Request validation failed",
  ) {
    return new ApiError(400, "VALIDATION_ERROR", message, undefined, fields);
  }

  static notFound(message: string) {
    return new ApiError(404, "NOT_FOUND", message);
  }

  static conflict(message: string) {
    return new ApiError(409, "CONFLICT", message);
  }

  static unauthorized(message: string = "Unauthorized") {
    return new ApiError(401, "UNAUTHORIZED", message);
  }

  static forbidden(message: string = "Forbidden") {
    return new ApiError(403, "FORBIDDEN", message);
  }
}
