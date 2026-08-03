import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiClient } from "@dealpilot/api-client";

const mocks = vi.hoisted(() => ({
  createApiClient: vi.fn(() => ({ auth: {}, storage: {} })),
}));

vi.mock("@dealpilot/api-client", () => ({
  API_ERROR_CODES: { invalidResponse: "INVALID_RESPONSE" },
  ApiError: class MockApiError extends Error {},
  createApiClient: mocks.createApiClient,
}));

let getCloudApiClient: () => ApiClient;

beforeAll(async () => {
  vi.stubEnv("VITE_SUPABASE_URL", "https://test.supabase.co");
  vi.stubEnv("VITE_SB_PUBLISHABLE_KEY", "test-publishable-key");
  ({ getCloudApiClient } = await import("./apiClient"));
});

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
