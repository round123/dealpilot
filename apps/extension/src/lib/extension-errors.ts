import { API_ERROR_CODES, ApiError } from "@dealpilot/api-client/error";

export { ApiError };

/** Safe user-facing copy. Server messages and arbitrary Error.message values are ignored. */
export function extensionErrorMessage(error: unknown, fallback: string): string {
  if (!(error instanceof ApiError)) return fallback;

  switch (error.code) {
    case API_ERROR_CODES.aborted:
      return "请求已取消";
    case API_ERROR_CODES.network:
      return "无法连接本地 Agent，请确认它正在运行";
    case API_ERROR_CODES.invalidResponse:
      return "本地 Agent 返回了无法识别的数据";
    case API_ERROR_CODES.unauthorized:
    case API_ERROR_CODES.forbidden:
      return "扩展配对已失效，请重新连接本地 Agent";
    default:
      return fallback;
  }
}
