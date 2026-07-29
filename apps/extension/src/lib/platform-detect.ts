/**
 * DealPilot 插件平台检测
 *
 * 检测当前 URL 是 WhatsApp 还是 Telegram，提取会话信息。
 * 在 content script 上下文中运行，读取 DOM 提取会话标识。
 */

import { Platform } from "@dealpilot/shared";
import { normalizePlatformIdentifier } from "@dealpilot/shared";

/** 平台检测结果 */
export interface PlatformInfo {
  /** 平台标识 */
  platform: "whatsapp" | "telegram";
  /** 平台展示名 */
  name: string;
  /** 是否支持当前页面 */
  supported: boolean;
}

/** 会话检测结果 */
export interface ConversationInfo {
  /** 平台 */
  platform: "whatsapp" | "telegram";
  /** 会话名称（展示用，如客户名、手机号、用户名） */
  conversationName: string;
  /** 原始标识（用于匹配 API） */
  rawIdentifier: string;
  /** 标准化标识 */
  normalizedIdentifier: string;
  /** 是否为一对一会话（群组/频道返回 false） */
  isOneOnOne: boolean;
  /** 会话类型 */
  conversationType: "one_on_one" | "group" | "channel" | "unknown";
}

/**
 * 检测当前页面所属平台
 */
export function detectPlatform(): PlatformInfo | null {
  const url = window.location.href;

  if (url.includes("web.whatsapp.com")) {
    return { platform: Platform.WHATSAPP, name: "WhatsApp", supported: true };
  }

  if (url.includes("web.telegram.org")) {
    return { platform: Platform.TELEGRAM, name: "Telegram", supported: true };
  }

  return null;
}

/**
 * 从 WhatsApp Web DOM 提取会话信息
 *
 * WhatsApp Web 的会话标题区域：
 * - 一对一会话：header 区域显示联系人名称或手机号
 * - 群组：标题后会跟群成员数
 */
function extractWhatsAppConversation(): ConversationInfo | null {
  // WhatsApp Web 会话标题在 header[role="banner"] 区域
  const headerEl = document.querySelector('header[data-testid="conversation-header"]') ??
    document.querySelector('header[role="banner"]');

  if (!headerEl) return null;

  // 会话名称通常在 span[title] 或 .chat-title 中
  const nameEl = headerEl.querySelector('span[title]') ??
    headerEl.querySelector('[data-testid="conversation-info-header-chat-title"]');

  const conversationName = nameEl?.getAttribute("title") ?? nameEl?.textContent?.trim() ?? "";

  if (!conversationName) return null;

  // WhatsApp 群组会话名称后通常会有成员数，如 "项目讨论组 (15)"
  const groupMatch = conversationName.match(/\(\d+\s*成员?\)|\(\d+\s*members?\)/i);

  // WhatsApp 群组在 header 中有群组图标或成员计数
  const isGroup = !!groupMatch ||
    !!headerEl.querySelector('[data-testid="group-info-icon"]') ||
    !!headerEl.querySelector('[data-testid="conversation-info-group-icon"]');

  // WhatsApp 会话 URL 中包含 phone 或 contact 编码
  const urlMatch = window.location.hash.match(/(\d+)/);
  const rawIdentifier = urlMatch?.[1] ?? conversationName;

  return {
    platform: Platform.WHATSAPP,
    conversationName,
    rawIdentifier,
    normalizedIdentifier: normalizePlatformIdentifier(Platform.WHATSAPP, rawIdentifier),
    isOneOnOne: !isGroup,
    conversationType: isGroup ? "group" : "one_on_one",
  };
}

/**
 * 从 Telegram Web DOM 提取会话信息
 *
 * Telegram Web 的会话标题区域：
 * - 一对一会话：显示用户名
 * - 群组：显示群组名 + 成员数
 * - 频道：显示频道名 + 订阅者数
 */
function extractTelegramConversation(): ConversationInfo | null {
  // Telegram Web 会话标题在 .chat-header 或 .header-title 区域
  const headerEl = document.querySelector('.chat-header') ??
    document.querySelector('.header-title') ??
    document.querySelector('[class*="ChatHeader"]');

  if (!headerEl) return null;

  // 会话名称
  const nameEl = headerEl.querySelector('.header-title-name') ??
    headerEl.querySelector('[class*="title"]') ??
    headerEl.querySelector('h3');

  const conversationName = nameEl?.textContent?.trim() ?? "";

  if (!conversationName) return null;

  // Telegram 群组/频道检测：
  // 1. 群组成员数通常在标题下方显示，如 "15 members" 或 "15 成员"
  // 2. 频道显示 "订阅者" 或 "subscribers"
  // 3. 顶部信息区域包含用户头像 vs 群组头像
  const subtitleEl = headerEl.querySelector('.header-title-subtitle') ??
    headerEl.querySelector('[class*="subtitle"]');

  const subtitle = subtitleEl?.textContent?.trim() ?? "";

  // 群组：subtitle 包含 members/成员
  const isGroup = /members|成员/i.test(subtitle);
  // 频道：subtitle 包含 subscribers/订阅者
  const isChannel = /subscribers|订阅者|channel/i.test(subtitle);

  // Telegram 会话 URL 中包含 chat id 或 username
  // 如 #?chat=p1234567890 (private chat) 或 #?chat=@username
  const urlMatch = window.location.hash.match(/chat=([@]?[\w]+)/);
  const rawIdentifier = urlMatch?.[1] ?? conversationName;

  let conversationType: ConversationInfo["conversationType"] = "one_on_one";
  if (isGroup) conversationType = "group";
  else if (isChannel) conversationType = "channel";

  return {
    platform: Platform.TELEGRAM,
    conversationName,
    rawIdentifier,
    normalizedIdentifier: normalizePlatformIdentifier(Platform.TELEGRAM, rawIdentifier),
    isOneOnOne: conversationType === "one_on_one",
    conversationType,
  };
}

/**
 * 检测当前会话信息（统一入口）
 *
 * 根据平台调用对应的 DOM 提取逻辑。
 * 当 DOM 尚未加载或不在会话页面时返回 null。
 */
export function detectConversation(): ConversationInfo | null {
  const platformInfo = detectPlatform();
  if (!platformInfo) return null;

  if (platformInfo.platform === Platform.WHATSAPP) {
    return extractWhatsAppConversation();
  }

  if (platformInfo.platform === Platform.TELEGRAM) {
    return extractTelegramConversation();
  }

  return null;
}

/**
 * 监听会话变化（URL 切换、DOM 更新）
 *
 * WhatsApp/Telegram Web 是 SPA，会话切换通过 URL hash 变化或 DOM 更新触发。
 * 使用 MutationObserver + hashchange 事件监听。
 */
export function onConversationChange(callback: (info: ConversationInfo | null) => void): () => void {
  let lastKey = "";

  const check = () => {
    const info = detectConversation();
    const key = info ? `${info.platform}:${info.normalizedIdentifier}:${info.conversationType}` : "";
    if (key !== lastKey) {
      lastKey = key;
      callback(info);
    }
  };

  // URL hash 变化
  window.addEventListener("hashchange", check);

  // DOM 变化（会话切换时 header 区域会更新）
  const observer = new MutationObserver(() => {
    check();
  });

  // 观察 body 子树变化
  observer.observe(document.body, { childList: true, subtree: true });

  // 初始检测
  check();

  // 返回取消监听函数
  return () => {
    window.removeEventListener("hashchange", check);
    observer.disconnect();
  };
}
