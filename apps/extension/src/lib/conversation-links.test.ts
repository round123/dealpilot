import { describe, expect, mock, test } from "bun:test";
import type { PopupReminder } from "@dealpilot/shared";
import {
  buildConversationLaunchPlan,
  openReminderConversation,
} from "./conversation-links";

const baseReminder: PopupReminder = {
  id: "11111111-1111-4111-8111-111111111111",
  customer_id: "22222222-2222-4222-8222-222222222222",
  project_id: null,
  type: "fixed_time",
  status: "pending",
  due_at: "2026-08-01T09:00:00.000Z",
  priority: "normal",
  last_notified_at: null,
  snooze_until: null,
  resolution: null,
  pause_reason: null,
  reevaluate_at: null,
  created_at: "2026-07-31T09:00:00.000Z",
  updated_at: "2026-07-31T09:00:00.000Z",
  customer_name: "示例客户",
  project_name: null,
  has_high_risk: false,
  conversation_target: null,
};

describe("platform conversation launching", () => {
  test("builds direct WhatsApp and Telegram conversation URLs", () => {
    expect(buildConversationLaunchPlan({
      platform: "whatsapp",
      raw_identifier: "+86 138-0000-0000",
    })).toEqual({ mode: "direct", url: "https://web.whatsapp.com/send?phone=8613800000000" });
    expect(buildConversationLaunchPlan({
      platform: "telegram",
      raw_identifier: "https://t.me/example_customer",
    })).toEqual({ mode: "direct", url: "https://web.telegram.org/k/#@example_customer" });
  });

  test("does not mistake display names for direct conversation identifiers", () => {
    expect(buildConversationLaunchPlan({
      platform: "whatsapp",
      raw_identifier: "Supplier 20260731",
    })).toEqual({
      mode: "platform",
      url: "https://web.whatsapp.com/",
      copyText: "Supplier 20260731",
    });
    expect(buildConversationLaunchPlan({
      platform: "telegram",
      raw_identifier: "example_customer",
    })).toEqual({
      mode: "platform",
      url: "https://web.telegram.org/k/",
      copyText: "example_customer",
    });
  });

  test("opens the platform and copies a searchable identifier when no deep link is safe", async () => {
    const openTab = mock(async () => undefined);
    const copyText = mock(async () => undefined);
    const openReminders = mock(async () => undefined);
    const reminder = {
      ...baseReminder,
      conversation_target: { platform: "whatsapp" as const, raw_identifier: "采购负责人 张三" },
    };

    await expect(openReminderConversation(reminder, {
      openTab,
      copyText,
      openReminders,
    })).resolves.toBe("platform_with_copy");
    expect(copyText).toHaveBeenCalledWith("采购负责人 张三");
    expect(openTab).toHaveBeenCalledWith("https://web.whatsapp.com/");
    expect(openReminders).not.toHaveBeenCalled();
  });

  test("still opens the platform when clipboard access is denied", async () => {
    const openTab = mock(async () => undefined);
    const copyText = mock(async () => { throw new Error("denied"); });

    await expect(openReminderConversation({
      ...baseReminder,
      conversation_target: { platform: "telegram", raw_identifier: "张三" },
    }, {
      openTab,
      copyText,
      openReminders: mock(async () => undefined),
    })).resolves.toBe("platform_without_copy");
    expect(openTab).toHaveBeenCalledWith("https://web.telegram.org/k/");
  });

  test("opens the reminder detail when the customer has no platform account", async () => {
    const openReminders = mock(async () => undefined);
    await expect(openReminderConversation(baseReminder, {
      openTab: mock(async () => undefined),
      copyText: mock(async () => undefined),
      openReminders,
    })).resolves.toBe("workbench");
    expect(openReminders).toHaveBeenCalledTimes(1);
  });
});
