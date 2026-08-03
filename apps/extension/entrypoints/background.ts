import { APP_VERSION } from "@dealpilot/shared";
import { defineBackground } from "wxt/sandbox";

import {
  fetchPendingReminderCount,
  onCloudAuthStateChange,
} from "../src/lib/api-client";
import {
  handleContentCloudRequest,
  isAllowedContentSender,
} from "../src/lib/background-content-rpc";
import { CONTENT_CLOUD_REQUEST } from "../src/lib/content-cloud-client";
import { safeUninstallUrl } from "../src/lib/uninstall-url";
import { openWorkbench } from "../src/lib/workbench-links";

const REMINDER_BADGE_ALARM = "dealpilot-reminder-badge";

async function refreshReminderBadge(): Promise<void> {
  try {
    const count = await fetchPendingReminderCount();
    await chrome.action.setBadgeText({
      text: count > 0 ? String(Math.min(count, 99)) : "",
    });
  } catch {
    await chrome.action.setBadgeText({ text: "" });
  }
}

function setupReminderBadge(): void {
  chrome.alarms.create(REMINDER_BADGE_ALARM, { periodInMinutes: 1 });
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === REMINDER_BADGE_ALARM) void refreshReminderBadge();
  });
  void refreshReminderBadge();
}

function setupMessageListener(): void {
  chrome.runtime.onMessage.addListener(
    (message: unknown, sender, sendResponse) => {
      if (!message || typeof message !== "object" || !("type" in message)) {
        return false;
      }
      if (message.type !== CONTENT_CLOUD_REQUEST) return false;
      if (!isAllowedContentSender(sender)) {
        sendResponse({ error: { code: "FORBIDDEN", status: 403 } });
        return false;
      }
      void handleContentCloudRequest(message, sender).then(sendResponse);
      return true;
    },
  );
}

function setupInstallListener(): void {
  chrome.runtime.onInstalled.addListener((details) => {
    if (details.reason === "install") {
      void openWorkbench("home");
    }
  });
}

function setupUninstallGuidance(): void {
  const url = safeUninstallUrl(
    import.meta.env.VITE_DEALPILOT_EXTENSION_UNINSTALL_URL,
  );
  chrome.runtime.setUninstallURL(url ?? "", () => {
    if (chrome.runtime.lastError) {
      console.warn(
        "[DealPilot] 无法设置扩展卸载说明页",
        chrome.runtime.lastError.message,
      );
    }
  });
}

export default defineBackground({
  main() {
    console.log(`[DealPilot] Cloud background started (v${APP_VERSION})`);

    // Supabase refresh tokens live in chrome.storage.local, but content scripts
    // must never be able to read them.
    void chrome.storage.local.setAccessLevel({
      accessLevel: "TRUSTED_CONTEXTS",
    });

    setupMessageListener();
    setupInstallListener();
    setupUninstallGuidance();
    setupReminderBadge();
    onCloudAuthStateChange(() => {
      void refreshReminderBadge();
    });
  },
});
