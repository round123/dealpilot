/**
 * DealPilot 插件 API 客户端
 *
 * 封装 fetch，token 来自 chrome.storage.local（由 background 通过 Native Messaging 获取）。
 * Content Script 不持有 API 令牌，统一通过本模块 + background 中转。
 */

import { API_PATHS, AGENT_DEFAULT_PORT, type Customer, type CustomerCreate, type Reminder, type FollowUp, type FollowUpCreate, type ReminderCreate, type MatchResolve, type MatchResolveResponse, type CustomerDetail } from "@dealpilot/shared";

/** storage 中 token 的 key */
const TOKEN_STORAGE_KEY = "dealpilot_api_token";
/** storage 中 Agent 端口的 key */
const PORT_STORAGE_KEY = "dealpilot_agent_port";

/** API 错误 */
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/** 从 chrome.storage.local 读取 token */
export async function getStoredToken(): Promise<string | null> {
  const result = await chrome.storage.local.get(TOKEN_STORAGE_KEY);
  return result[TOKEN_STORAGE_KEY] ?? null;
}

/** 存储 token 到 chrome.storage.local */
export async function setStoredToken(token: string): Promise<void> {
  await chrome.storage.local.set({ [TOKEN_STORAGE_KEY]: token });
}

/** 从 chrome.storage.local 读取 Agent 端口 */
export async function getAgentPort(): Promise<number> {
  const result = await chrome.storage.local.get(PORT_STORAGE_KEY);
  return result[PORT_STORAGE_KEY] ?? AGENT_DEFAULT_PORT;
}

/** 存储 Agent 端口 */
export async function setAgentPort(port: number): Promise<void> {
  await chrome.storage.local.set({ [PORT_STORAGE_KEY]: port });
}

/** 获取 API base URL */
export async function getBaseUrl(): Promise<string> {
  const port = await getAgentPort();
  return `http://127.0.0.1:${port}`;
}

/** 获取认证 headers（含 token） */
async function getAuthHeaders(): Promise<Record<string, string>> {
  const token = await getStoredToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  return headers;
}

/** 生成幂等键 */
function generateIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** 核心 fetch 封装 */
async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
  withIdempotency = false,
): Promise<T> {
  const baseUrl = await getBaseUrl();
  const headers = await getAuthHeaders();

  if (withIdempotency) {
    headers["Idempotency-Key"] = generateIdempotencyKey();
  }

  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: { ...headers, ...options.headers },
  });

  if (!response.ok) {
    let errorBody: unknown;
    try {
      errorBody = await response.json();
    } catch {
      // 非 JSON 错误响应
    }
    const message =
      (errorBody as { error?: { message?: string } })?.error?.message ??
      `请求失败 (${response.status})`;
    throw new ApiError(response.status, message, errorBody);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

// ===== 客户 API =====

/** GET /reminders/popup - 获取 popup 待办列表 */
export async function fetchPopupReminders(): Promise<Reminder[]> {
  return apiFetch<Reminder[]>(API_PATHS.remindersPopup);
}

/** POST /customers - 新建客户 */
export async function createCustomer(data: CustomerCreate): Promise<Customer> {
  return apiFetch<Customer>(
    API_PATHS.customers,
    { method: "POST", body: JSON.stringify(data) },
    true,
  );
}

/** GET /customers/:id - 客户详情 */
export async function fetchCustomerDetail(id: string): Promise<CustomerDetail> {
  return apiFetch<CustomerDetail>(API_PATHS.customer(id));
}

// ===== 匹配 API =====

/** POST /matches/resolve - 会话身份匹配 */
export async function resolveMatch(data: MatchResolve): Promise<MatchResolveResponse> {
  return apiFetch<MatchResolveResponse>(
    API_PATHS.matchResolve,
    { method: "POST", body: JSON.stringify(data) },
  );
}

/** POST /matches/bind - 人工绑定会话到客户 */
export async function bindMatch(
  data: { platform: string; raw_identifier: string; customer_id: string },
): Promise<void> {
  return apiFetch(
    API_PATHS.matchBind,
    { method: "POST", body: JSON.stringify(data) },
    true,
  );
}

// ===== 跟进 API =====

/** POST /follow-ups - 新建跟进记录 */
export async function createFollowUp(data: FollowUpCreate): Promise<FollowUp> {
  return apiFetch<FollowUp>(
    API_PATHS.followUps,
    { method: "POST", body: JSON.stringify(data) },
    true,
  );
}

/** GET /follow-ups?customer_id=xxx - 按客户获取跟进列表 */
export async function fetchFollowUps(customerId: string, limit = 5): Promise<{ items: FollowUp[]; next_cursor: string | null }> {
  const query = new URLSearchParams({ customer_id: customerId, limit: String(limit) });
  return apiFetch(`${API_PATHS.followUps}?${query.toString()}`);
}

// ===== 提醒 API =====

/** POST /reminders - 新建提醒 */
export async function createReminder(data: ReminderCreate): Promise<Reminder> {
  return apiFetch<Reminder>(
    API_PATHS.reminders,
    { method: "POST", body: JSON.stringify(data) },
    true,
  );
}

/** GET /reminders?customer_id=xxx - 按客户获取提醒列表 */
export async function fetchRemindersByCustomer(customerId: string): Promise<{ items: Reminder[]; next_cursor: string | null }> {
  const query = new URLSearchParams({ customer_id: customerId, limit: "10" });
  return apiFetch(`${API_PATHS.reminders}?${query.toString()}`);
}
