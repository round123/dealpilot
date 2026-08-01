import { describe, expect, test } from "bun:test";

import {
  canReuseRememberedMessage,
  conversationIdentity,
} from "./conversation-identity";

const conversation = {
  platform: "telegram" as const,
  conversationName: "采购负责人",
  rawIdentifier: "@buyer",
  normalizedIdentifier: "buyer",
  isOneOnOne: true,
  conversationType: "one_on_one" as const,
};

describe("remembered message conversation boundary", () => {
  test("reuses a connected message only inside the same conversation", () => {
    const identity = conversationIdentity(conversation);
    expect(canReuseRememberedMessage(identity, identity, true)).toBe(true);
    expect(
      canReuseRememberedMessage(
        identity,
        conversationIdentity({
          ...conversation,
          rawIdentifier: "@other",
          normalizedIdentifier: "other",
        }),
        true,
      ),
    ).toBe(false);
  });

  test("rejects detached nodes and unknown conversations", () => {
    const identity = conversationIdentity(conversation);
    expect(canReuseRememberedMessage(identity, identity, false)).toBe(false);
    expect(canReuseRememberedMessage(identity, null, true)).toBe(false);
    expect(canReuseRememberedMessage(null, identity, true)).toBe(false);
  });
});
