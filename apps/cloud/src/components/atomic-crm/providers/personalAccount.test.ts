import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  signUp: vi.fn(),
}));

vi.mock("./apiClient", () => ({
  getCloudApiClient: () => ({
    auth: {
      signUp: mocks.signUp,
    },
  }),
}));

import { personalAccount } from "./personalAccount";

describe("personalAccount registration consent", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-03T09:10:11.123Z"));
    mocks.signUp.mockReset().mockResolvedValue({ user: null, session: null });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("records only profile and versioned legal consent metadata", async () => {
    await personalAccount.signUp({
      email: "ming.li@example.com",
      password: "secure-pass-123",
      first_name: " 明 ",
      last_name: " 李 ",
    });

    expect(mocks.signUp).toHaveBeenCalledExactlyOnceWith(
      "ming.li@example.com",
      "secure-pass-123",
      {
        emailRedirectTo: `${window.location.origin}/auth-callback.html`,
        metadata: {
          display_name: "明 李",
          first_name: "明",
          last_name: "李",
          legal_consent: {
            privacy_policy_version: "2026-08-03",
            terms_of_service_version: "2026-08-03",
            accepted_at: "2026-08-03T09:10:11.123Z",
          },
        },
      },
    );
  });
});
