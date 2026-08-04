export type SupportedMessagingPlatform = "whatsapp" | "telegram";

function normalizedName(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

/**
 * Produces the identifier stored by bindings and emitted by DOM adapters.
 * WhatsApp display-name fallbacks are namespaced so two named chats do not
 * collapse to the empty identifier produced by phone-only normalization.
 */
export function canonicalPlatformIdentifier(
  platform: string,
  value: string,
): string {
  const trimmed = value.trim();
  if (!trimmed) return "";

  if (platform === "whatsapp") {
    if (trimmed.toLocaleLowerCase().startsWith("name:")) {
      const name = normalizedName(trimmed.slice(5));
      return name ? `name:${name}` : "";
    }

    const withoutJid = trimmed.replace(/@(?:c\.us|s\.whatsapp\.net)$/i, "");
    const digits = withoutJid.replace(/\D/g, "");
    const looksLikePhone =
      /@(?:c\.us|s\.whatsapp\.net)$/i.test(trimmed) ||
      (/^\+?[\d\s().-]+$/.test(withoutJid) && digits.length >= 6);
    return looksLikePhone ? digits : `name:${normalizedName(trimmed)}`;
  }

  if (platform === "telegram") {
    return trimmed
      .toLocaleLowerCase()
      .replace(/^https?:\/\/(?:www\.)?t\.me\//, "")
      .replace(/^#/, "")
      .replace(/^@/, "")
      .replace(/\/+$/, "");
  }

  return normalizedName(trimmed);
}
