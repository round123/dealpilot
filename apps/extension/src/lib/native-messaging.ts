/**
 * DealPilot 插件 Native Messaging 封装
 *
 * Popup / Content Script 通过受限消息查询 Agent 状态。
 * API token 永远不通过 runtime message 返回给 Content Script。
 *
 * 安全约束：Content Script 不持有 API 令牌，统一通过本模块向 background 中转请求。
 */

/** 消息类型常量 */
export const MSG_TYPES = {
  /** Agent 状态查询 */
  GET_AGENT_STATUS: "GET_AGENT_STATUS",
  /** Agent 状态结果 */
  AGENT_STATUS_RESULT: "AGENT_STATUS_RESULT",
} as const;

export interface GetAgentStatusMessage {
  type: typeof MSG_TYPES.GET_AGENT_STATUS;
}

/** Agent 状态结果 */
export interface AgentStatusResultMessage {
  type: typeof MSG_TYPES.AGENT_STATUS_RESULT;
  running: boolean;
}

/** 所有消息类型 */
export type ExtensionMessage =
  | GetAgentStatusMessage
  | AgentStatusResultMessage;

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
