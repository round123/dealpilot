const MAX_UNINSTALL_URL_LENGTH = 1023;

export function safeUninstallUrl(value: string | undefined): string | null {
  const candidate = value?.trim();
  if (!candidate || candidate.length > MAX_UNINSTALL_URL_LENGTH) return null;

  try {
    const url = new URL(candidate);
    if (url.protocol !== "https:" || url.username || url.password) return null;
    const hostname = url.hostname.toLowerCase();
    if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]") {
      return null;
    }
    for (const key of url.searchParams.keys()) {
      if (/^(access_)?token$|^authorization$/i.test(key)) return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}
