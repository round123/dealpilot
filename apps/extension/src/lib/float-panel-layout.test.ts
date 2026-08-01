import { describe, expect, test } from "bun:test";

import { shouldAutoCollapseFloatPanel } from "./float-panel-layout";

describe("floating panel responsive behavior", () => {
  test("collapses below 600px and remains expanded at the boundary", () => {
    expect(shouldAutoCollapseFloatPanel(599)).toBe(true);
    expect(shouldAutoCollapseFloatPanel(600)).toBe(false);
    expect(shouldAutoCollapseFloatPanel(1200)).toBe(false);
  });
});
