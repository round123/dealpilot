import { describe, expect, test } from "bun:test";

import { EXTENSION_PERMISSIONS } from "./manifest-permissions";

describe("extension manifest permissions", () => {
  test("requests only the browser capabilities used by the extension", () => {
    expect(EXTENSION_PERMISSIONS).toEqual(["storage", "alarms"]);
    expect(EXTENSION_PERMISSIONS).not.toContain("activeTab");
  });
});
