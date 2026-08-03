import { API_ERROR_CODES, ApiError } from "@dealpilot/api-client/error";

export { ApiError };

/** Safe user-facing copy. Server messages and arbitrary Error.message values are ignored. */
export function extensionErrorMessage(error: unknown, fallback: string): string {
  if (!(error instanceof ApiError)) return fallback;

  switch (error.code) {
    case API_ERROR_CODES.aborted:
      return "请求已取消";
    case API_ERROR_CODES.network:
      return "无法连接云端服务，请检查网络后重试";
    case API_ERROR_CODES.invalidResponse:
      return "云端服务返回了无法识别的数据";
    case API_ERROR_CODES.unauthorized:
    case API_ERROR_CODES.forbidden:
      return "登录已失效，请重新登录 DealPilot";
    default:
      return fallback;
  }
}
