/**
 * DealPilot 平台标识常量
 */

export const PLATFORMS = {
  WHATSAPP: "whatsapp",
  TELEGRAM: "telegram",
} as const;

export const PLATFORM_URLS: Record<string, string[]> = {
  whatsapp: ["https://web.whatsapp.com/*"],
  telegram: ["https://web.telegram.org/*"],
};

export const PLATFORM_NAMES: Record<string, string> = {
  whatsapp: "WhatsApp",
  telegram: "Telegram",
};
