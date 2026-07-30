import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createApiClient: vi.fn(() => ({ auth: {}, storage: {} })),
}));

vi.mock("@dealpilot/api-client", () => ({
  createApiClient: mocks.createApiClient,
}));

import { getCloudApiClient } from "./apiClient";

describe("cloud API client", () => {
  beforeEach(() => mocks.createApiClient.mockClear());

  it("creates one shared client for auth, data, functions, and storage", () => {
    const first = getCloudApiClient();
    const second = getCloudApiClient();

    expect(first).toBe(second);
    expect(mocks.createApiClient).toHaveBeenCalledOnce();
    expect(mocks.createApiClient).toHaveBeenCalledWith(
      expect.objectContaining({
        options: {
          auth: {
            flowType: "pkce",
            detectSessionInUrl: false,
          },
        },
      }),
    );
  });
});
