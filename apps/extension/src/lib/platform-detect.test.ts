import { afterEach, describe, expect, it } from "bun:test";

import { onConversationChange } from "./platform-detect";

const globals = globalThis as typeof globalThis & {
  window?: {
    location: { href: string; hash: string };
    addEventListener: () => void;
    removeEventListener: () => void;
  };
  document?: { body: object };
  MutationObserver?: new (callback: () => void) => {
    observe: () => void;
    disconnect: () => void;
  };
};

const originalWindow = globals.window;
const originalDocument = globals.document;
const originalMutationObserver = globals.MutationObserver;

const setGlobal = (name: "window" | "document" | "MutationObserver", value: unknown) => {
  Object.defineProperty(globalThis, name, { configurable: true, value, writable: true });
};

afterEach(() => {
  setGlobal("window", originalWindow);
  setGlobal("document", originalDocument);
  setGlobal("MutationObserver", originalMutationObserver);
});

describe("onConversationChange", () => {
  it("reports an unsupported page on the initial check", () => {
    setGlobal("window", {
      location: { href: "https://example.test/", hash: "" },
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    });
    setGlobal("document", { body: {} });
    setGlobal("MutationObserver", class {
      observe() {}
      disconnect() {}
    });

    const changes: unknown[] = [];
    const unsubscribe = onConversationChange((info) => changes.push(info));

    expect(changes).toEqual([null]);
    unsubscribe();
  });
});
