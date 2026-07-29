/**
 * DealPilot 插件 Background Service Worker (MV3)
 *
 * 职责：
 * 1. Native Messaging Bootstrap：通过 chrome.nativeMessaging.connect 连接 DealPilot Agent，获取 API token
 * 2. Token 管理：收到 token 后存入 chrome.storage.local
 * 3. 消息桥：Content Script / Popup 之间的消息中转
 * 4. install/update 事件：首次安装引导
 */

import { defineBackground } from "wxt/sandbox";
import { AGENT_DEFAULT_PORT, APP_VERSION } from "@dealpilot/shared";
import { getStoredToken, setStoredToken, setAgentPort, getAgentPort } from "../src/lib/api-client";
import { MSG_TYPES, type ExtensionMessage } from "../src/lib/native-messaging";

/** Native Messaging 连接名（需与 Agent 注册的 native messaging host name 一致） */
const NM_HOST_NAME = "com.dealpilot.agent";

/** token 刷新间隔（分钟） */
const TOKEN_REFRESH_INTERVAL_MS = 30 * 60 * 1000;

/** Native Messaging 连接（持久化） */
let nmPort: chrome.runtime.Port | null = null;

/** token 刷新定时器 */
let refreshTimer: ReturnType<typeof setInterval> | null = null;

/**
 * 连接 DealPilot Agent (Native Messaging)
 *
 * Native Messaging 协议：
 * - Chrome 发送 4 字节长度前缀的 JSON 消息
 * - Agent 返回相同格式的 JSON 响应
 * - 连接建立后 Agent 返回 { type: "auth", token: "xxx", port: 31081 }
 */
function connectToAgent(): void {
  try {
    nmPort = chrome.runtime.connectNative(NM_HOST_NAME);

    nmPort.onMessage.addListener((msg: unknown) => {
      handleNativeMessage(msg);
    });

    nmPort.onDisconnect.addListener(() => {
      console.warn("[DealPilot] Native Messaging 连接断开");
      nmPort = null;
      // 断开后 5 秒重试
      setTimeout(connectToAgent, 5000);
    });

    // 连接建立后发送 hello 消息请求 token
    nmPort.postMessage({ type: "hello", extension_version: APP_VERSION });
  } catch (err) {
    console.error("[DealPilot] 连接 Agent 失败:", err);
    nmPort = null;
    setTimeout(connectToAgent, 10000);
  }
}

/**
 * 处理来自 Agent 的 Native Messaging 消息
 */
function handleNativeMessage(msg: unknown): void {
  const message = msg as { type?: string; token?: string; port?: number; error?: string };

  if (!message || typeof message !== "object") return;

  switch (message.type) {
    case "auth": {
      // 收到 token
      if (message.token) {
        setStoredToken(message.token).then(() => {
          console.log("[DealPilot] API token 已保存");
        });
      }
      if (message.port) {
        setAgentPort(message.port).then(() => {
          console.log(`[DealPilot] Agent 端口: ${message.port}`);
        });
      }
      break;
    }
    case "token_refresh": {
      // token 刷新
      if (message.token) {
        setStoredToken(message.token).then(() => {
          console.log("[DealPilot] API token 已刷新");
        });
      }
      break;
    }
    case "error": {
      console.error("[DealPilot] Agent 报错:", message.error);
      break;
    }
    default:
      // 忽略未知消息
      break;
  }
}

/**
 * 主动请求刷新 token
 */
function requestTokenRefresh(): void {
  if (nmPort) {
    nmPort.postMessage({ type: "refresh_token" });
  } else {
    // 重连
    connectToAgent();
  }
}

/**
 * 启动 token 刷新定时器
 */
function startTokenRefreshTimer(): void {
  if (refreshTimer) clearInterval(refreshTimer);
  refreshTimer = setInterval(requestTokenRefresh, TOKEN_REFRESH_INTERVAL_MS);
}

/**
 * 处理来自 Content Script / Popup 的消息
 */
function setupMessageListener(): void {
  chrome.runtime.onMessage.addListener(
    (message: ExtensionMessage, _sender, sendResponse) => {
      if (!message || typeof message !== "object" || !("type" in message)) {
        return false;
      }

      switch (message.type) {
        case MSG_TYPES.GET_TOKEN: {
          // Content Script / Popup 请求 token
          getStoredToken().then((token) => {
            if (token) {
              getAgentPort().then((port) => {
                sendResponse({
                  type: MSG_TYPES.TOKEN_RESULT,
                  token,
                  port,
                });
              });
            } else {
              // 无 token，尝试刷新
              requestTokenRefresh();
              sendResponse({
                type: MSG_TYPES.TOKEN_ERROR,
                error: "尚未获取到 API token，请确认 DealPilot Agent 正在运行",
              });
            }
          });
          return true; // 异步响应
        }

        case MSG_TYPES.GET_AGENT_STATUS: {
          // 查询 Agent 连接状态
          getStoredToken().then((token) => {
            sendResponse({ running: !!nmPort && !!token });
          });
          return true;
        }

        default:
          return false;
      }
    },
  );
}

/**
 * 插件安装/更新事件
 */
function setupInstallListener(): void {
  chrome.runtime.onInstalled.addListener((details) => {
    if (details.reason === "install") {
      // 首次安装：打开引导页
      console.log("[DealPilot] 插件已安装");
      chrome.tabs.create({
        url: "https://127.0.0.1:" + AGENT_DEFAULT_PORT + "/welcome",
      });
    } else if (details.reason === "update") {
      console.log(`[DealPilot] 插件已更新到 ${APP_VERSION}`);
    }
  });
}

/**
 * Service Worker 启动入口
 */
export default defineBackground({
  main() {
    console.log(`[DealPilot] Background Service Worker 启动 (v${APP_VERSION})`);

    // 1. 连接 Agent（Native Messaging）
    connectToAgent();

    // 2. 启动 token 刷新定时器
    startTokenRefreshTimer();

    // 3. 设置消息监听
    setupMessageListener();

    // 4. 设置安装事件监听
    setupInstallListener();
  },
});
