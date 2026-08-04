import { detectConversation, type ConversationInfo } from "./platform-adapter";

export {
  detectConversation,
  detectPlatform,
  type ConversationInfo,
  type PlatformInfo,
} from "./platform-adapter";

/** Watches the URL and header DOM because both supported web apps are SPAs. */
export function onConversationChange(
  callback: (info: ConversationInfo | null) => void,
): () => void {
  let lastKey: string | null = null;

  const check = () => {
    const info = detectConversation();
    const key = info
      ? `${info.platform}:${info.normalizedIdentifier}:${info.conversationType}`
      : "";
    if (key !== lastKey) {
      lastKey = key;
      callback(info);
    }
  };

  window.addEventListener("hashchange", check);
  const observer = new MutationObserver(check);
  observer.observe(document.body, { childList: true, subtree: true });
  check();

  return () => {
    window.removeEventListener("hashchange", check);
    observer.disconnect();
  };
}
