/**
 * DealPilot 插件 Background Service Worker (MV3)
 *
 * 职责：
 * 1. Native Messaging Bootstrap：通过 chrome.nativeMessaging.connect 连接 DealPilot Agent，获取 API token
 * 2. Token 管理：收到 token 后仅存入 chrome.storage.session
 * 3. 消息桥：Content Script / Popup 之间的消息中转
 * 4. install/update 事件：首次安装引导
 */

import { defineBackground } from "wxt/sandbox";
import { APP_VERSION } from "@dealpilot/shared";
import {
  fetchPendingReminderCount,
  getAgentPort,
  getStoredToken,
  getWorkbenchOrigin,
  setAgentPort,
  setStoredToken,
  setWorkbenchOrigin,
} from "../src/lib/api-client";
import { MSG_TYPES, type ExtensionMessage } from "../src/lib/native-messaging";
import { buildWorkbenchUrl } from "../src/lib/workbench-links";
import {
  handleContentAgentRequest,
  isAllowedContentSender,
} from "../src/lib/background-content-rpc";
import { CONTENT_AGENT_REQUEST } from "../src/lib/content-agent-client";

/** Native Messaging 连接名（需与 Agent 注册的 native messaging host name 一致） */
const NM_HOST_NAME = "com.dealpilot.agent";

/** token 刷新间隔（分钟） */
const TOKEN_REFRESH_INTERVAL_MS = 30 * 60 * 1000;
const REMINDER_BADGE_ALARM = "dealpilot-reminder-badge";

/** Native Messaging 连接（持久化） */
let nmPort: chrome.runtime.Port | null = null;

/** token 刷新定时器 */
let refreshTimer: ReturnType<typeof setInterval> | null = null;
let openWorkbenchAfterPairing = false;

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
  const message = msg as {
    type?: string;
    token?: string;
    port?: number;
    workbench_origin?: string;
    error?: string;
  };

  if (!message || typeof message !== "object") return;

  switch (message.type) {
    case "auth": {
      const updates: Promise<void>[] = [];
      if (message.token) updates.push(setStoredToken(message.token));
      if (message.port) updates.push(setAgentPort(message.port));
      if (message.workbench_origin) {
        updates.push(setWorkbenchOrigin(message.workbench_origin));
      }
      Promise.all(updates).then(() => {
        console.log("[DealPilot] Agent 配对信息已保存");
        if (openWorkbenchAfterPairing) {
          openWorkbenchAfterPairing = false;
          void openStoredWorkbench();
        }
        return refreshReminderBadge();
      }).catch((error) => console.warn("[DealPilot] 角标刷新失败:", error));
      break;
    }
    case "token_refresh": {
      // token 刷新
      if (message.token) {
        const updates = [setStoredToken(message.token)];
        if (message.port) updates.push(setAgentPort(message.port));
        if (message.workbench_origin) {
          updates.push(setWorkbenchOrigin(message.workbench_origin));
        }
        Promise.all(updates).then(() => {
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

async function refreshReminderBadge(): Promise<void> {
  try {
    const count = await fetchPendingReminderCount();
    await chrome.action.setBadgeText({ text: count > 0 ? String(Math.min(count, 99)) : "" });
  } catch (error) {
    await chrome.action.setBadgeText({ text: "" });
    throw error;
  }
}

function setupReminderBadge(): void {
  chrome.alarms.create(REMINDER_BADGE_ALARM, { periodInMinutes: 1 });
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === REMINDER_BADGE_ALARM) {
      void refreshReminderBadge().catch(() => undefined);
    }
  });
  void refreshReminderBadge().catch(() => undefined);
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
    (message: unknown, sender, sendResponse) => {
      if (!message || typeof message !== "object" || !("type" in message)) {
        return false;
      }

      if (message.type === CONTENT_AGENT_REQUEST) {
        if (!isAllowedContentSender(sender)) {
          sendResponse({ ok: false, error: { code: "FORBIDDEN", status: 403 } });
          return false;
        }
        void handleContentAgentRequest(message, sender).then(sendResponse);
        return true;
      }

      switch ((message as ExtensionMessage).type) {
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
      // 首次安装：等 Native Messaging 配对完成后打开带 token 的 Atomic 工作台。
      console.log("[DealPilot] 插件已安装");
      openWorkbenchAfterPairing = true;
      void openStoredWorkbench().then((opened) => {
        if (opened) openWorkbenchAfterPairing = false;
        else requestTokenRefresh();
      });
    } else if (details.reason === "update") {
      console.log(`[DealPilot] 插件已更新到 ${APP_VERSION}`);
    }
  });
}

async function openStoredWorkbench(): Promise<boolean> {
  const [token, port, workbenchOrigin] = await Promise.all([
    getStoredToken(),
    getAgentPort(),
    getWorkbenchOrigin(),
  ]);
  if (!token) return false;
  await chrome.tabs.create({
    url: buildWorkbenchUrl({ token, port, workbenchOrigin }, "home"),
  });
  return true;
}

/**
 * Service Worker 启动入口
 */
export default defineBackground({
  main() {
    console.log(`[DealPilot] Background Service Worker 启动 (v${APP_VERSION})`);

    // Session storage is restricted to trusted extension pages/background.
    void chrome.storage.session.setAccessLevel({
      accessLevel: "TRUSTED_CONTEXTS",
    });

    // 1. 连接 Agent（Native Messaging）
    connectToAgent();

    // 2. 启动 token 刷新定时器
    startTokenRefreshTimer();

    // 3. 设置消息监听
    setupMessageListener();

    // 4. 设置安装事件监听
    setupInstallListener();

    // 5. 每分钟刷新待办角标
    setupReminderBadge();
  },
});
