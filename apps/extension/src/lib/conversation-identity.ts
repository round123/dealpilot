import type { ConversationInfo } from "./platform-adapter";

export function conversationIdentity(
  conversation: ConversationInfo | null,
): string | null {
  if (!conversation) return null;
  return [
    conversation.platform,
    conversation.normalizedIdentifier,
    conversation.conversationType,
  ].join(":");
}

export function canReuseRememberedMessage(
  rememberedIdentity: string | null,
  currentIdentity: string | null,
  isConnected: boolean,
): boolean {
  return Boolean(
    isConnected &&
    rememberedIdentity &&
    currentIdentity &&
    rememberedIdentity === currentIdentity,
  );
}
