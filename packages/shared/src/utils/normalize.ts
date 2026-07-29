/**
 * DealPilot 数据标准化工具
 */

/**
 * 邮箱标准化（小写 + trim）
 */
export function normalizeEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  const trimmed = email.trim().toLowerCase();
  return trimmed || null;
}

/**
 * 手机号标准化为 E.164 格式（简单版）
 * 去除空格、括号、短横线，如果不含+前缀则不加
 */
export function normalizePhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const cleaned = phone.replace(/[\s()\-]/g, "");
  if (!cleaned) return null;
  if (!cleaned.startsWith("+") && /^\d+$/.test(cleaned)) {
    return cleaned;
  }
  return cleaned;
}

/**
 * 平台标识标准化
 * WhatsApp: 去除 @c.us 等后缀，保留纯数字
 * Telegram: 去除 @ 前缀，小写
 */
export function normalizePlatformIdentifier(platform: string, raw: string): string {
  const normalized = raw.trim();
  if (platform === "whatsapp") {
    // WhatsApp: 电话号码格式，去除非数字字符（保留+）
    return normalized.replace(/[@].*$/, "").replace(/[^\d+]/g, "");
  }
  if (platform === "telegram") {
    // Telegram: username，小写去@
    return normalized.replace(/^@/, "").toLowerCase();
  }
  return normalized.toLowerCase();
}
