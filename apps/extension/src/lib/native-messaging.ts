/**
 * DealPilot 插件 Native Messaging 封装
 *
 * Content Script / Popup 通过 chrome.runtime.sendMessage 向 background 请求 token。
 * Background 通过 chrome.nativeMessaging.connect 连接 DealPilot Agent 获取 token。
 *
 * 安全约束：Content Script 不持有 API 令牌，统一通过本模块向 background 中转请求。
 */

/** 消息类型常量 */
export const MSG_TYPES = {
  /** 请求获取 token（popup / content -> background） */
  GET_TOKEN: "GET_TOKEN",
  /** token 获取成功（background -> popup / content） */
  TOKEN_RESULT: "TOKEN_RESULT",
  /** token 获取失败（background -> popup / content） */
  TOKEN_ERROR: "TOKEN_ERROR",
  /** 请求触发匹配解析（content -> background，可选中转） */
  RESOLVE_MATCH: "RESOLVE_MATCH",
  /** Agent 状态查询 */
  GET_AGENT_STATUS: "GET_AGENT_STATUS",
  /** Agent 状态结果 */
  AGENT_STATUS_RESULT: "AGENT_STATUS_RESULT",
} as const;

/** 获取 token 请求消息 */
export interface GetTokenMessage {
  type: typeof MSG_TYPES.GET_TOKEN;
}

export interface GetAgentStatusMessage {
  type: typeof MSG_TYPES.GET_AGENT_STATUS;
}

/** token 结果消息 */
export interface TokenResultMessage {
  type: typeof MSG_TYPES.TOKEN_RESULT;
  token: string;
  port: number;
}

/** token 错误消息 */
export interface TokenErrorMessage {
  type: typeof MSG_TYPES.TOKEN_ERROR;
  error: string;
}

/** Agent 状态结果 */
export interface AgentStatusResultMessage {
  type: typeof MSG_TYPES.AGENT_STATUS_RESULT;
  running: boolean;
}

/** 所有消息类型 */
export type ExtensionMessage =
  | GetTokenMessage
  | GetAgentStatusMessage
  | TokenResultMessage
  | TokenErrorMessage
  | AgentStatusResultMessage;

/**
 * 向 background 请求获取 API token
 * Content Script 和 Popup 统一使用此函数
 */
export async function requestToken(): Promise<{ token: string; port: number }> {
  return new Promise((resolve, reject) => {
    const message: GetTokenMessage = { type: MSG_TYPES.GET_TOKEN };

    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      if (!response) {
        reject(new Error("background 未响应"));
        return;
      }
      if (response.type === MSG_TYPES.TOKEN_RESULT) {
        resolve({ token: response.token, port: response.port });
      } else if (response.type === MSG_TYPES.TOKEN_ERROR) {
        reject(new Error(response.error));
      } else {
        reject(new Error(`未知响应类型: ${response.type}`));
      }
    });
  });
}

/**
 * 向 background 查询 Agent 运行状态
 */
export async function requestAgentStatus(): Promise<boolean> {
  return new Promise((resolve) => {
    const message: GetAgentStatusMessage = { type: MSG_TYPES.GET_AGENT_STATUS };

    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError || !response) {
        resolve(false);
        return;
      }
      resolve(response.running ?? false);
    });
  });
}

/**
 * 监听来自 background 的消息
 * 用于接收 token 更新等推送
 */
export function onBackgroundMessage(
  handler: (message: ExtensionMessage) => void,
): () => void {
  const listener = (message: ExtensionMessage) => {
    if (message && typeof message === "object" && "type" in message) {
      handler(message);
    }
  };
  chrome.runtime.onMessage.addListener(listener);
  return () => chrome.runtime.onMessage.removeListener(listener);
}
