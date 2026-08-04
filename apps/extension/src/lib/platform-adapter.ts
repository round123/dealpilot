import { MessageDirection, Platform } from "@dealpilot/shared";

import { conversationIdentity } from "./conversation-identity";
import { canonicalPlatformIdentifier } from "./platform-identity";

export interface PlatformInfo {
  platform: "whatsapp" | "telegram";
  name: string;
  supported: boolean;
}

export interface ConversationInfo {
  platform: "whatsapp" | "telegram";
  conversationName: string;
  rawIdentifier: string;
  normalizedIdentifier: string;
  isOneOnOne: boolean;
  conversationType: "one_on_one" | "group" | "channel" | "unknown";
}

export interface SelectedMessage {
  body: string;
  direction: "inbound" | "outbound";
  timestamp: string | null;
}

export interface PlatformAdapter {
  getConversation: () => ConversationInfo | null;
  getSelectedMessage: () => SelectedMessage | null;
  isOneOnOne: () => boolean;
}

export interface PlatformDomContext {
  window: Window;
  document: Document;
}

interface InteractionState {
  installed: boolean;
  lastMessage: { element: Element; conversationIdentity: string | null } | null;
}

const interactionStates = new WeakMap<Document, InteractionState>();

const WHATSAPP_MESSAGE_SELECTOR =
  ".message-in, .message-out, [data-testid='msg-container']";
const TELEGRAM_MESSAGE_SELECTOR =
  ".Message, .message-list-item, [data-message-id], [class*='message'][class*='bubble']";
const ALL_MESSAGE_SELECTOR = `${WHATSAPP_MESSAGE_SELECTOR}, ${TELEGRAM_MESSAGE_SELECTOR}`;
const REPLY_SELECTOR =
  ".reply, .quoted, .reply-preview, .ReplyPreview, [data-testid='quoted-message'], [class*='reply-preview'], [class*='ReplyPreview']";
const NON_BODY_SELECTOR = `${REPLY_SELECTOR}, time, .chat-timestamp, [class*='timestamp'], [class*='message-time'], [class*='MessageMeta']`;

function defaultContext(): PlatformDomContext {
  return { window, document };
}

function stateFor(document: Document): InteractionState {
  let state = interactionStates.get(document);
  if (!state) {
    state = { installed: false, lastMessage: null };
    interactionStates.set(document, state);
  }
  return state;
}

function asElement(value: EventTarget | null): Element | null {
  return value && "nodeType" in value && value.nodeType === 1
    ? (value as Element)
    : null;
}

function installInteractionTracking(context: PlatformDomContext): void {
  const state = stateFor(context.document);
  if (state.installed) return;

  const remember = (event: Event) => {
    const message = asElement(event.target)?.closest(ALL_MESSAGE_SELECTOR);
    if (!message) return;
    state.lastMessage = {
      element: message,
      conversationIdentity: conversationIdentity(detectConversation(context)),
    };
  };

  context.document.addEventListener("pointerdown", remember, true);
  context.document.addEventListener("contextmenu", remember, true);
  state.installed = true;
}

/**
 * Installs metadata-only interaction tracking before the user can click a
 * message. The handler remembers an element and conversation identity; it
 * deliberately does not read message text.
 */
export function initializePlatformAdapter(
  context: PlatformDomContext = defaultContext(),
): void {
  if (detectPlatform(context)) installInteractionTracking(context);
}

function elementAttribute(
  element: Element,
  names: readonly string[],
): string | null {
  for (const name of names) {
    const value = element.getAttribute(name)?.trim();
    if (value) return value;
  }
  return null;
}

function whatsAppConversation(
  context: PlatformDomContext,
): ConversationInfo | null {
  const header =
    context.document.querySelector(
      'header[data-testid="conversation-header"]',
    ) ?? context.document.querySelector('header[role="banner"]');
  if (!header) return null;

  const nameElement =
    header.querySelector(
      '[data-testid="conversation-info-header-chat-title"]',
    ) ??
    header.querySelector("span[title]") ??
    header.querySelector("h1, h2, h3");
  const conversationName =
    nameElement?.getAttribute("title")?.trim() ??
    nameElement?.textContent?.trim() ??
    "";
  if (!conversationName) return null;

  const identifierElement = header.matches(
    "[data-chat-id], [data-jid], [data-contact-id]",
  )
    ? header
    : header.querySelector("[data-chat-id], [data-jid], [data-contact-id]");
  const jid = identifierElement
    ? elementAttribute(identifierElement, [
        "data-chat-id",
        "data-jid",
        "data-contact-id",
      ])
    : null;
  const explicitType = elementAttribute(header, [
    "data-chat-type",
    "data-conversation-type",
    "aria-label",
  ]);
  const metadata = [
    jid,
    conversationName,
    explicitType,
    header.className,
    header.querySelector("[data-testid*='subtitle'], [class*='subtitle']")
      ?.textContent,
  ]
    .filter(Boolean)
    .join(" ");
  const isChannel = /@broadcast\b|\bchannel\b|频道/i.test(metadata);
  const isGroup =
    /@g\.us\b|\bgroup\b|群组|群聊|\bmembers?\b|成员/i.test(metadata) ||
    Boolean(
      header.querySelector(
        '[data-testid="group-info-icon"], [data-testid="conversation-info-group-icon"]',
      ),
    );

  const hashPhone = context.window.location.hash.match(
    /(?:^|\D)(\d{6,})(?:\D|$)/,
  )?.[1];
  const rawIdentifier =
    jid?.replace(/@(?:c\.us|s\.whatsapp\.net)$/i, "") ??
    hashPhone ??
    conversationName;
  const hasPrivateEvidence =
    /@(?:c\.us|s\.whatsapp\.net)$/i.test(jid ?? "") ||
    Boolean(identifierElement?.hasAttribute("data-contact-id")) ||
    Boolean(hashPhone) ||
    !canonicalPlatformIdentifier(
      Platform.WHATSAPP,
      conversationName,
    ).startsWith("name:") ||
    /\b(?:contact|private|direct|one[_ -]?on[_ -]?one)\b|私聊|联系人/iu.test(
      explicitType ?? "",
    );
  const conversationType = isChannel
    ? "channel"
    : isGroup
      ? "group"
      : hasPrivateEvidence
        ? "one_on_one"
        : "unknown";

  return {
    platform: Platform.WHATSAPP,
    conversationName,
    rawIdentifier,
    normalizedIdentifier: canonicalPlatformIdentifier(
      Platform.WHATSAPP,
      rawIdentifier,
    ),
    isOneOnOne: conversationType === "one_on_one",
    conversationType,
  };
}

function telegramRouteIdentifier(context: PlatformDomContext): string | null {
  const hash = decodeURIComponent(
    context.window.location.hash.replace(/^#/, ""),
  ).trim();
  const legacy = hash.match(/(?:^|[?&])chat=([^&]+)/)?.[1];
  if (legacy) return legacy;
  const route = hash.split(/[?&]/, 1)[0]?.replace(/^\//, "");
  return route && /^@?[\w-]+$/u.test(route) ? route : null;
}

function telegramConversation(
  context: PlatformDomContext,
): ConversationInfo | null {
  const header =
    context.document.querySelector(".chat-header") ??
    context.document.querySelector('[data-testid="chat-header"]') ??
    context.document.querySelector(".ChatInfo") ??
    context.document.querySelector('[class*="ChatHeader"]') ??
    context.document.querySelector(".header-title");
  if (!header) return null;

  const nameElement =
    header.querySelector(".header-title-name") ??
    header.querySelector(".peer-title") ??
    header.querySelector('[data-testid="chat-title"]') ??
    header.querySelector("h1, h2, h3") ??
    header.querySelector('[class*="title"]');
  const conversationName = nameElement?.textContent?.trim() ?? "";
  if (!conversationName) return null;

  const subtitle =
    header.querySelector(
      ".header-title-subtitle, [data-testid='chat-subtitle'], [class*='subtitle']",
    )?.textContent ?? "";
  const explicitType = elementAttribute(header, [
    "data-peer-type",
    "data-chat-type",
    "aria-label",
  ]);
  const metadata = [explicitType, header.className, subtitle]
    .filter(Boolean)
    .join(" ");
  const isChannel = /\bchannel\b|\bsubscribers?\b|频道|订阅者|подписчик/iu.test(
    metadata,
  );
  const isGroup =
    /\bgroup\b|\bmembers?\b|\bparticipants?\b|群组|群聊|成员|участник/iu.test(
      metadata,
    );
  const hasPrivateEvidence =
    /\b(?:user|contact|private|direct|one[_ -]?on[_ -]?one)\b|私聊|联系人/iu.test(
      explicitType ?? "",
    ) ||
    /\b(?:last seen|online|offline|bot)\b|最近上线|在线|离线|机器人/iu.test(
      subtitle,
    );
  const conversationType = isChannel
    ? "channel"
    : isGroup
      ? "group"
      : hasPrivateEvidence
        ? "one_on_one"
        : "unknown";
  const rawIdentifier = telegramRouteIdentifier(context) ?? conversationName;

  return {
    platform: Platform.TELEGRAM,
    conversationName,
    rawIdentifier,
    normalizedIdentifier: canonicalPlatformIdentifier(
      Platform.TELEGRAM,
      rawIdentifier,
    ),
    isOneOnOne: conversationType === "one_on_one",
    conversationType,
  };
}

export function detectPlatform(
  context: PlatformDomContext = defaultContext(),
): PlatformInfo | null {
  const host = context.window.location.hostname;
  if (host === "web.whatsapp.com") {
    return { platform: Platform.WHATSAPP, name: "WhatsApp", supported: true };
  }
  if (host === "web.telegram.org") {
    return { platform: Platform.TELEGRAM, name: "Telegram", supported: true };
  }
  return null;
}

export function detectConversation(
  context: PlatformDomContext = defaultContext(),
): ConversationInfo | null {
  const platform = detectPlatform(context)?.platform;
  if (platform === Platform.WHATSAPP) return whatsAppConversation(context);
  if (platform === Platform.TELEGRAM) return telegramConversation(context);
  return null;
}

function selectedTextMessage(
  context: PlatformDomContext,
  selector: string,
): Element | null {
  const selectionNode = context.window.getSelection()?.anchorNode;
  const selectionElement =
    selectionNode?.nodeType === 1
      ? (selectionNode as Element)
      : selectionNode?.parentElement;
  return selectionElement?.closest(selector) ?? null;
}

function explicitlySelectedMessage(
  document: Document,
  selector: string,
): Element | null {
  return (
    [...document.querySelectorAll(selector)].find((element) => {
      const classes =
        typeof element.className === "string"
          ? element.className.split(/\s+/)
          : [];
      return (
        element.getAttribute("aria-selected") === "true" ||
        classes.includes("selected") ||
        classes.includes("is-selected")
      );
    }) ?? null
  );
}

function rememberedMessage(
  context: PlatformDomContext,
  selector: string,
): Element | null {
  const state = stateFor(context.document);
  const remembered = state.lastMessage;
  if (!remembered) return null;
  const currentIdentity = conversationIdentity(detectConversation(context));
  if (
    !remembered.element.isConnected ||
    !remembered.conversationIdentity ||
    remembered.conversationIdentity !== currentIdentity
  ) {
    state.lastMessage = null;
    return null;
  }
  return remembered.element.closest(selector);
}

function messageElement(
  context: PlatformDomContext,
  selector: string,
): Element | null {
  return (
    explicitlySelectedMessage(context.document, selector) ??
    selectedTextMessage(context, selector) ??
    rememberedMessage(context, selector)
  );
}

function cleanText(element: Element): string {
  const clone = element.cloneNode(true) as Element;
  clone.querySelectorAll(NON_BODY_SELECTOR).forEach((item) => item.remove());
  clone.querySelectorAll("br").forEach((item) => item.replaceWith("\n"));
  clone.querySelectorAll("p, div").forEach((item) => item.append("\n"));
  return (clone.textContent ?? "")
    .replace(/\u00a0/g, " ")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n")
    .trim();
}

function messageBody(element: Element, selectors: string): string | null {
  const candidates = [
    ...(element.matches(selectors) ? [element] : []),
    ...element.querySelectorAll(selectors),
  ];
  const bodies = candidates
    .filter((candidate) => {
      const reply = candidate.closest(REPLY_SELECTOR);
      return !reply || !element.contains(reply);
    })
    .map(cleanText)
    .filter(Boolean);
  return bodies.at(-1) ?? null;
}

function parseTimestamp(value: string | null | undefined): string | null {
  const candidate = value?.trim();
  if (!candidate) return null;
  let milliseconds: number;
  if (/^\d{10}$/.test(candidate)) milliseconds = Number(candidate) * 1000;
  else if (/^\d{13}$/.test(candidate)) milliseconds = Number(candidate);
  else if (/^\d{4}-\d{2}-\d{2}T/.test(candidate))
    milliseconds = Date.parse(candidate);
  else return null;
  return Number.isFinite(milliseconds)
    ? new Date(milliseconds).toISOString()
    : null;
}

function messageTimestamp(element: Element): string | null {
  const values = [
    elementAttribute(element, ["datetime", "data-timestamp", "data-time"]),
    ...[
      ...element.querySelectorAll(
        "time, [datetime], [data-timestamp], [data-time]",
      ),
    ].flatMap((item) => [
      elementAttribute(item, ["datetime", "data-timestamp", "data-time"]),
      item.textContent,
    ]),
  ];
  for (const value of values) {
    const parsed = parseTimestamp(value);
    if (parsed) return parsed;
  }
  return null;
}

function whatsAppDirection(
  element: Element,
): SelectedMessage["direction"] | null {
  const explicit = element.getAttribute("data-direction")?.toLocaleLowerCase();
  if (
    explicit === "out" ||
    explicit === "outgoing" ||
    explicit === "outbound"
  ) {
    return MessageDirection.OUTBOUND;
  }
  if (explicit === "in" || explicit === "incoming" || explicit === "inbound") {
    return MessageDirection.INBOUND;
  }
  if (element.classList.contains("message-out"))
    return MessageDirection.OUTBOUND;
  if (element.classList.contains("message-in")) return MessageDirection.INBOUND;
  return null;
}

function telegramDirection(
  element: Element,
): SelectedMessage["direction"] | null {
  const explicit = element
    .getAttribute("data-message-direction")
    ?.toLocaleLowerCase();
  if (["out", "outgoing", "outbound", "sent"].includes(explicit ?? "")) {
    return MessageDirection.OUTBOUND;
  }
  if (["in", "incoming", "inbound", "received"].includes(explicit ?? "")) {
    return MessageDirection.INBOUND;
  }
  const classes =
    typeof element.className === "string"
      ? element.className.toLocaleLowerCase().split(/\s+/)
      : [];
  if (
    classes.some((value) =>
      ["own", "outgoing", "message-out", "is-out", "sent"].includes(value),
    )
  ) {
    return MessageDirection.OUTBOUND;
  }
  if (
    classes.some((value) =>
      ["incoming", "message-in", "is-in", "received"].includes(value),
    )
  ) {
    return MessageDirection.INBOUND;
  }
  return classes.some((value) =>
    ["message", "message-list-item"].includes(value),
  )
    ? MessageDirection.INBOUND
    : null;
}

function selectedMessage(
  context: PlatformDomContext,
  platform: "whatsapp" | "telegram",
): SelectedMessage | null {
  const conversation = detectConversation(context);
  if (!conversation?.isOneOnOne || conversation.platform !== platform)
    return null;

  const messageSelector =
    platform === Platform.WHATSAPP
      ? WHATSAPP_MESSAGE_SELECTOR
      : TELEGRAM_MESSAGE_SELECTOR;
  const element = messageElement(context, messageSelector);
  if (!element) return null;
  const body = messageBody(
    element,
    platform === Platform.WHATSAPP
      ? ".selectable-text.copyable-text, [data-testid='message-text'], .message-text"
      : ".text-content, .message-text, .MessageText, [class*='text-content'], [class*='message-text']",
  );
  if (!body) return null;
  const direction =
    platform === Platform.WHATSAPP
      ? whatsAppDirection(element)
      : telegramDirection(element);
  if (!direction) return null;

  return { body, direction, timestamp: messageTimestamp(element) };
}

export function getPlatformAdapter(
  context: PlatformDomContext = defaultContext(),
): PlatformAdapter | null {
  const platform = detectPlatform(context)?.platform;
  if (!platform) return null;
  initializePlatformAdapter(context);
  return {
    getConversation: () => detectConversation(context),
    getSelectedMessage: () => selectedMessage(context, platform),
    isOneOnOne: () => detectConversation(context)?.isOneOnOne ?? false,
  };
}
