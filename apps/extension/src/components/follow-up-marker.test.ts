import { describe, expect, test } from "bun:test";

if (typeof document === "undefined") {
  Object.defineProperty(globalThis, "document", {
    value: { addEventListener: () => undefined },
    configurable: true,
  });
}

const { createFollowUpAttemptStore } = await import(
  "../../entrypoints/content/components/follow-up-marker"
);

describe("FollowUpMarker retry attempt", () => {
  test("retains message body, direction, timestamp and idempotency key after failure", () => {
    const store = createFollowUpAttemptStore();
    let factoryCalls = 0;
    const first = store.getOrCreate(() => {
      factoryCalls++;
      return {
        key: "stable-message-key",
        data: {
          customer_id: "11111111-1111-4111-8111-111111111111",
          type: "message",
          message_body: "Message body",
          message_direction: "outbound",
          occurred_at: "2026-07-31T09:00:00.000Z",
        },
      };
    });

    const retry = store.getOrCreate(() => {
      factoryCalls++;
      return {
        key: "different-key-that-must-not-be-used",
        data: {
          customer_id: first.data.customer_id,
          type: "message",
          message_body: "Changed body",
          message_direction: "inbound",
          occurred_at: "2026-07-31T10:00:00.000Z",
        },
      };
    });

    expect(factoryCalls).toBe(1);
    expect(retry).toBe(first);
    expect(retry.key).toBe("stable-message-key");
    expect(retry.data).toMatchObject({
      message_body: "Message body",
      message_direction: "outbound",
      occurred_at: "2026-07-31T09:00:00.000Z",
    });
  });

  test("clears the attempt only after a successful write", () => {
    const store = createFollowUpAttemptStore();
    const first = store.getOrCreate(() => ({
      key: "first-key",
      data: {
        customer_id: "11111111-1111-4111-8111-111111111111",
        type: "note",
        note: "First note",
        occurred_at: "2026-07-31T09:00:00.000Z",
      },
    }));
    store.clear();
    const next = store.getOrCreate(() => ({
      key: "second-key",
      data: {
        customer_id: first.data.customer_id,
        type: "note",
        note: "Second note",
        occurred_at: "2026-07-31T10:00:00.000Z",
      },
    }));

    expect(next).not.toBe(first);
    expect(next.key).toBe("second-key");
  });
});
