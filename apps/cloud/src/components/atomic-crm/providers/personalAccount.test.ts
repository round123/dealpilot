import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  accountDeleteCurrent: vi.fn(),
}));

vi.mock("./apiClient", () => ({
  getCloudApiClient: () => ({
    account: { deleteCurrent: mocks.accountDeleteCurrent },
  }),
}));

import { personalAccount } from "./personalAccount";

describe("personal account deletion", () => {
  beforeEach(() => {
    mocks.accountDeleteCurrent.mockReset().mockResolvedValue({ deleted: true });
  });

  it("deletes through the typed account API", async () => {
    const signal = new AbortController().signal;

    await personalAccount.deleteAccount(signal);

    expect(mocks.accountDeleteCurrent).toHaveBeenCalledWith({ signal });
  });

  it("propagates server-side deletion failures", async () => {
    mocks.accountDeleteCurrent.mockRejectedValue(new Error("delete failed"));

    await expect(personalAccount.deleteAccount()).rejects.toThrow(
      "delete failed",
    );
  });
});
