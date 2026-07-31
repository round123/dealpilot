import { describe, expect, it } from "vitest";

import { canRestoreValidatedBackup } from "./localDataRules";

describe("local data restore gate", () => {
  it("only allows restore after integrity validation succeeds", () => {
    expect(canRestoreValidatedBackup(null)).toBe(false);
    expect(
      canRestoreValidatedBackup({ valid: false, integrity_ok: false }),
    ).toBe(false);
    expect(
      canRestoreValidatedBackup({ valid: true, integrity_ok: false }),
    ).toBe(false);
    expect(
      canRestoreValidatedBackup({ valid: true, integrity_ok: true }),
    ).toBe(true);
  });
});
