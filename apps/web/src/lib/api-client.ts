import { generateUUID } from "@dealpilot/shared";
import { API_PATHS } from "@dealpilot/shared";

const BASE_URL = "/api/v1";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

function getToken(): string | null {
  return sessionStorage.getItem("dealpilot_token");
}

export function setToken(token: string): void {
  sessionStorage.setItem("dealpilot_token", token);
}

export function clearToken(): void {
  sessionStorage.removeItem("dealpilot_token");
}

function buildUrl(path: string, query?: Record<string, unknown>): string {
  const url = new URL(`${location.origin}${path}`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null || value === "") continue;
      if (Array.isArray(value)) {
        for (const v of value) {
          url.searchParams.append(key, String(v));
        }
      } else {
        url.searchParams.set(key, String(value));
      }
    }
  }
  return url.pathname + url.search;
}

interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  body?: unknown;
  query?: Record<string, unknown>;
  headers?: Record<string, string>;
  idempotent?: boolean;
  multipart?: FormData;
  responseType?: "json" | "blob";
}

export async function request<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const {
    method = "GET",
    body,
    query,
    headers = {},
    idempotent = false,
    multipart,
    responseType = "json",
  } = options;

  const url = buildUrl(path, query);
  const token = getToken();

  const finalHeaders: Record<string, string> = {
    ...headers,
  };

  if (token) {
    finalHeaders.Authorization = `Bearer ${token}`;
  }

  if (idempotent) {
    finalHeaders["Idempotency-Key"] = generateUUID();
  }

  let requestBody: BodyInit | undefined;
  if (multipart) {
    requestBody = multipart;
  } else if (body !== undefined) {
    finalHeaders["Content-Type"] = "application/json";
    requestBody = JSON.stringify(body);
  }

  const response = await fetch(url, {
    method,
    headers: finalHeaders,
    body: requestBody,
  });

  if (response.status === 204) {
    return undefined as T;
  }

  if (response.status === 401) {
    clearToken();
    throw new ApiError(401, "未授权，请重新获取访问令牌", "UNAUTHORIZED");
  }

  if (response.status === 403) {
    throw new ApiError(403, "拒绝访问", "FORBIDDEN");
  }

  if (response.status >= 400) {
    let errorBody: { error?: { code?: string; message?: string; details?: unknown } } | null = null;
    try {
      errorBody = await response.json();
    } catch {
      // 非 JSON 错误响应
    }
    const message = errorBody?.error?.message ?? `请求失败 (${response.status})`;
    throw new ApiError(response.status, message, errorBody?.error?.code, errorBody?.error?.details);
  }

  if (responseType === "blob") {
    return (await response.blob()) as T;
  }

  return (await response.json()) as T;
}

export const api = {
  get: <T>(path: string, query?: Record<string, unknown> | object) =>
    request<T>(path, { method: "GET", query: query as Record<string, unknown> | undefined }),

  post: <T>(path: string, body?: unknown, opts?: { idempotent?: boolean }) =>
    request<T>(path, { method: "POST", body, idempotent: opts?.idempotent }),

  put: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "PUT", body }),

  delete: <T>(path: string) =>
    request<T>(path, { method: "DELETE" }),

  upload: <T>(path: string, formData: FormData) =>
    request<T>(path, { method: "POST", multipart: formData }),

  download: (path: string, body?: unknown) =>
    request<Blob>(path, { method: "POST", body, responseType: "blob" }),
};

export { API_PATHS };
