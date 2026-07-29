/**
 * DealPilot 格式化工具
 * 前后端共享的纯函数
 */

/**
 * 格式化金额（按币种）
 */
export function formatAmount(amount: number | null | undefined, currency: string = "USD"): string {
  if (amount === null || amount === undefined) return "-";
  const symbols: Record<string, string> = {
    USD: "$",
    EUR: "\u20AC",
    GBP: "\u00A3",
    CNY: "\u00A5",
    JPY: "\u00A5",
  };
  const symbol = symbols[currency] ?? "";
  return `${symbol}${amount.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

/**
 * 格式化日期（本地时区展示）
 */
export function formatDate(iso: string | null | undefined, locale: string = "zh-CN"): string {
  if (!iso) return "-";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "-";
  return d.toLocaleDateString(locale, { year: "numeric", month: "2-digit", day: "2-digit" });
}

/**
 * 格式化日期时间
 */
export function formatDateTime(iso: string | null | undefined, locale: string = "zh-CN"): string {
  if (!iso) return "-";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "-";
  return d.toLocaleString(locale, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * 相对时间（如"3小时前"、"2天前"）
 */
export function formatRelativeTime(iso: string | null | undefined): string {
  if (!iso) return "-";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "-";
  const now = Date.now();
  const diff = now - d.getTime();
  const minutes = Math.floor(diff / 60_000);
  const hours = Math.floor(diff / 3_600_000);
  const days = Math.floor(diff / 86_400_000);
  if (minutes < 1) return "刚刚";
  if (minutes < 60) return `${minutes}分钟前`;
  if (hours < 24) return `${hours}小时前`;
  if (days < 30) return `${days}天前`;
  return formatDate(iso);
}

/**
 * 判断是否逾期
 */
export function isOverdue(dueAt: string | null | undefined): boolean {
  if (!dueAt) return false;
  return new Date(dueAt).getTime() < Date.now();
}
