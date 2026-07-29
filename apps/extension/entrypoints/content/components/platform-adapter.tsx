/**
 * DealPilot 插件平台适配层
 *
 * WhatsApp/Telegram DOM 适配：
 * - 提取对话名称
 * - 识别一对一 vs 群组
 * - 提取当前选中消息
 *
 * 与 platform-detect 的区别：
 * - platform-detect 关注平台和会话标识（用于 API 匹配）
 * - platform-adapter 关注 DOM 交互（如读取选中消息、会话类型判断）
 */

import type { ConversationInfo } from "../../../src/lib/platform-detect";
import { MessageDirection, FollowUpType } from "@dealpilot/shared";

let lastInteractedMessage: Element | null = null;

function rememberMessageTarget(event: Event) {
  const target = event.target;
  if (!(target instanceof Element)) return;
  const message = target.closest(
    ".message-in, .message-out, [class*='message'][class*='bubble']",
  );
  if (message) lastInteractedMessage = message;
}

document.addEventListener("pointerdown", rememberMessageTarget, true);
document.addEventListener("contextmenu", rememberMessageTarget, true);

function selectedTextMessage(selector: string): Element | null {
  const selectionNode = window.getSelection()?.anchorNode;
  const selectionElement = selectionNode instanceof Element
    ? selectionNode
    : selectionNode?.parentElement;
  return selectionElement?.closest(selector) ?? null;
}

function safeTimestamp(value: string | null | undefined): string | null {
  if (!value) return null;
  const timestamp = new Date(value);
  return Number.isNaN(timestamp.getTime()) ? null : timestamp.toISOString();
}

/** 平台适配器接口 */
export interface PlatformAdapter {
  /** 获取会话信息 */
  getConversation: () => ConversationInfo | null;
  /** 获取当前用户选中的消息正文 */
  getSelectedMessage: () => SelectedMessage | null;
  /** 判断是否在一对一会话 */
  isOneOnOne: () => boolean;
}

/** 选中的消息 */
export interface SelectedMessage {
  /** 消息正文 */
  body: string;
  /** 消息方向 */
  direction: "inbound" | "outbound";
  /** 消息时间（ISO） */
  timestamp: string | null;
}

/** WhatsApp 适配器 */
const whatsappAdapter: PlatformAdapter = {
  getConversation: () => {
    // WhatsApp Web 会话标题
    const headerEl = document.querySelector('header[data-testid="conversation-header"]');
    if (!headerEl) return null;

    const nameEl = headerEl.querySelector('span[title]');
    const conversationName = nameEl?.getAttribute("title") ?? "";

    if (!conversationName) return null;

    // 群组检测：WhatsApp 群组标题后通常有成员数
    const isGroup =
      /\(\d+\s*成员?\)|\(\d+\s*members?\)/i.test(conversationName) ||
      !!headerEl.querySelector('[data-testid="group-info-icon"]');

    const urlMatch = window.location.hash.match(/(\d+)/);
    const rawIdentifier = urlMatch?.[1] ?? conversationName;

    return {
      platform: "whatsapp" as const,
      conversationName,
      rawIdentifier,
      normalizedIdentifier: rawIdentifier,
      isOneOnOne: !isGroup,
      conversationType: isGroup ? ("group" as const) : ("one_on_one" as const),
    };
  },

  getSelectedMessage: () => {
    // WhatsApp Web 选中消息：.message-in / .message-out
    const selectedEl = document.querySelector(
      '.message-in[aria-selected="true"], .message-out[aria-selected="true"], .message-in.selected, .message-out.selected',
    ) ?? selectedTextMessage(".message-in, .message-out")
      ?? lastInteractedMessage?.closest(".message-in, .message-out");

    if (!selectedEl) return null;

    const bodyEl = selectedEl.querySelector('.selectable-text.copyable-text') ??
      selectedEl.querySelector('[data-testid="message-text"]');
    const body = bodyEl?.textContent?.trim() ?? "";
    if (!body) return null;

    const isOutbound = selectedEl.classList.contains("message-out");
    const timeEl = selectedEl.querySelector('.chat-timestamp');
    const timestamp = safeTimestamp(timeEl?.getAttribute("datetime"));

    return {
      body,
      direction: isOutbound ? MessageDirection.OUTBOUND : MessageDirection.INBOUND,
      timestamp,
    };
  },

  isOneOnOne: () => {
    const conv = whatsappAdapter.getConversation();
    return conv?.isOneOnOne ?? false;
  },
};

/** Telegram 适配器 */
const telegramAdapter: PlatformAdapter = {
  getConversation: () => {
    const headerEl = document.querySelector('.chat-header') ??
      document.querySelector('[class*="ChatHeader"]');
    if (!headerEl) return null;

    const nameEl = headerEl.querySelector('.header-title-name') ??
      headerEl.querySelector('[class*="title"]');
    const conversationName = nameEl?.textContent?.trim() ?? "";
    if (!conversationName) return null;

    const subtitleEl = headerEl.querySelector('.header-title-subtitle') ??
      headerEl.querySelector('[class*="subtitle"]');
    const subtitle = subtitleEl?.textContent?.trim() ?? "";

    const isGroup = /members|成员/i.test(subtitle);
    const isChannel = /subscribers|订阅者|channel/i.test(subtitle);

    const urlMatch = window.location.hash.match(/chat=([@]?[\w]+)/);
    const rawIdentifier = urlMatch?.[1] ?? conversationName;

    return {
      platform: "telegram" as const,
      conversationName,
      rawIdentifier,
      normalizedIdentifier: rawIdentifier,
      isOneOnOne: !isGroup && !isChannel,
      conversationType: isGroup ? ("group" as const) : isChannel ? ("channel" as const) : ("one_on_one" as const),
    };
  },

  getSelectedMessage: () => {
    // Telegram Web 消息元素
    const messageSelector = '[class*="message"][class*="bubble"]';
    const selectedEl = document.querySelector(
      `${messageSelector}[aria-selected="true"], ${messageSelector}.selected, ${messageSelector}.is-selected`,
    ) ?? selectedTextMessage(messageSelector)
      ?? lastInteractedMessage?.closest(messageSelector);
    if (!selectedEl) return null;

    const bodyEl = selectedEl.querySelector('[class*="text-content"], [class*="message-text"]');
    const body = bodyEl?.textContent?.trim() ?? "";
    if (!body) return null;

    // Telegram: 消息方向通过 class 判断
    const className = typeof selectedEl.className === "string" ? selectedEl.className : "";
    const isOutbound = className.includes("out") || className.includes("sent");
    const timeEl = selectedEl.querySelector('[class*="time"], [class*="date"]');
    const timeText = timeEl?.textContent?.trim();
    const timestamp = safeTimestamp(timeText);

    return {
      body,
      direction: isOutbound ? MessageDirection.OUTBOUND : MessageDirection.INBOUND,
      timestamp,
    };
  },

  isOneOnOne: () => {
    const conv = telegramAdapter.getConversation();
    return conv?.isOneOnOne ?? false;
  },
};

/** 获取当前平台的适配器 */
export function getPlatformAdapter(): PlatformAdapter | null {
  const url = window.location.href;
  if (url.includes("web.whatsapp.com")) return whatsappAdapter;
  if (url.includes("web.telegram.org")) return telegramAdapter;
  return null;
}

/** 跟进类型映射（消息标记时） */
export const MESSAGE_FOLLOW_UP_TYPE = FollowUpType.MESSAGE;
