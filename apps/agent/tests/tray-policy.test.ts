import { describe, expect, it } from "bun:test";
import { shouldStartTray } from "../src/platform/tray-policy";

describe("tray startup policy", () => {
  it("starts the tray even when the legacy minimize setting is false", () => {
    expect(shouldStartTray(undefined, false)).toBe(true);
    expect(shouldStartTray(undefined, true)).toBe(true);
  });

  it("only allows the explicit test/operations override to skip the tray", () => {
    expect(shouldStartTray("1", false)).toBe(false);
    expect(shouldStartTray("0", false)).toBe(true);
  });
});
