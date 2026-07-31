import type { PopupReminder } from "@dealpilot/shared";
import { openWorkbench } from "./workbench-links";

export type ConversationLaunchMode =
  | "direct"
  | "platform_with_copy"
  | "platform_without_copy"
  | "workbench";

export interface ConversationLaunchPlan {
  mode: "direct" | "platform";
  url: string;
  copyText?: string;
}

export function buildConversationLaunchPlan(
  target: NonNullable<PopupReminder["conversation_target"]>,
): ConversationLaunchPlan {
  const rawIdentifier = target.raw_identifier.trim();

  if (target.platform === "whatsapp") {
    const phone = rawIdentifier.replace(/\D/g, "");
    const phoneLike = /^\+?[\d\s().-]+$/.test(rawIdentifier);
    if (phoneLike && phone.length >= 7 && phone.length <= 15) {
      return { mode: "direct", url: `https://web.whatsapp.com/send?phone=${phone}` };
    }
    return {
      mode: "platform",
      url: "https://web.whatsapp.com/",
      ...(rawIdentifier ? { copyText: rawIdentifier } : {}),
    };
  }

  const hasExplicitUsername = rawIdentifier.startsWith("@")
    || /^https?:\/\/(?:www\.)?t\.me\//i.test(rawIdentifier);
  const username = rawIdentifier
    .replace(/^https?:\/\/(?:www\.)?t\.me\//i, "")
    .replace(/^@/, "")
    .replace(/\/+$/, "");
  if (hasExplicitUsername && /^[A-Za-z][A-Za-z0-9_]{4,31}$/.test(username)) {
    return { mode: "direct", url: `https://web.telegram.org/k/#@${username}` };
  }
  return {
    mode: "platform",
    url: "https://web.telegram.org/k/",
    ...(rawIdentifier ? { copyText: rawIdentifier } : {}),
  };
}

interface ConversationLaunchDependencies {
  openTab: (url: string) => Promise<unknown>;
  copyText: (text: string) => Promise<void>;
  openReminders: () => Promise<void>;
}

const defaultDependencies: ConversationLaunchDependencies = {
  openTab: (url) => chrome.tabs.create({ url }),
  copyText: (text) => navigator.clipboard.writeText(text),
  openReminders: () => openWorkbench("reminders"),
};

export async function openReminderConversation(
  reminder: PopupReminder,
  dependencies: ConversationLaunchDependencies = defaultDependencies,
): Promise<ConversationLaunchMode> {
  if (!reminder.conversation_target) {
    await dependencies.openReminders();
    return "workbench";
  }

  const plan = buildConversationLaunchPlan(reminder.conversation_target);
  if (plan.mode === "direct") {
    await dependencies.openTab(plan.url);
    return "direct";
  }

  let copied = false;
  if (plan.copyText) {
    try {
      await dependencies.copyText(plan.copyText);
      copied = true;
    } catch {
      // The platform still opens when browser clipboard permission is unavailable.
    }
  }
  await dependencies.openTab(plan.url);
  return copied ? "platform_with_copy" : "platform_without_copy";
}
