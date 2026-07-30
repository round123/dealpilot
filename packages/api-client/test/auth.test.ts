import { describe, expect, it, vi } from "vitest";
import { createAuthApi } from "../src/auth.js";
import { API_ERROR_CODES } from "../src/error.js";

const wireUser = {
  id: "550e8400-e29b-41d4-a716-446655440000",
  email: "person@example.com",
  user_metadata: { locale: "zh-CN" },
  created_at: "2026-07-30T00:00:00.000Z",
};

const wireSession = {
  access_token: "access-token",
  refresh_token: "refresh-token",
  expires_at: 1_800_000_000,
  expires_in: 3600,
  token_type: "bearer",
  user: wireUser,
};

function authClient(overrides: Record<string, unknown> = {}) {
  return {
    signInWithPassword: vi.fn().mockResolvedValue({
      data: { session: wireSession, user: wireUser },
      error: null,
    }),
    signUp: vi.fn(),
    resetPasswordForEmail: vi.fn(),
    exchangeCodeForSession: vi.fn(),
    updateUser: vi.fn(),
    signOut: vi.fn(),
    getSession: vi.fn(),
    onAuthStateChange: vi.fn(),
    ...overrides,
  };
}

describe("auth facade", () => {
  it("returns a package-owned camelCase session", async () => {
    const auth = authClient();
    const api = createAuthApi({ auth } as never);

    await expect(
      api.signInWithPassword("person@example.com", "secret"),
    ).resolves.toEqual({
      expiresAt: 1_800_000_000,
      expiresIn: 3600,
      user: {
        id: wireUser.id,
        email: wireUser.email,
        metadata: { locale: "zh-CN" },
        createdAt: wireUser.created_at,
      },
    });
  });

  it("normalizes Supabase Auth errors", async () => {
    const api = createAuthApi({
      auth: authClient({
        signInWithPassword: vi.fn().mockResolvedValue({
          data: { session: null },
          error: {
            code: "invalid_credentials",
            message: "Invalid login credentials",
            status: 400,
            name: "AuthApiError",
            request_id: "req-auth",
          },
        }),
      }),
    } as never);

    await expect(
      api.signInWithPassword("person@example.com", "wrong"),
    ).rejects.toMatchObject({
      code: "invalid_credentials",
      status: 400,
      requestId: "req-auth",
    });
  });

  it("rejects malformed sessions at the Zod boundary", async () => {
    const api = createAuthApi({
      auth: authClient({
        getSession: vi.fn().mockResolvedValue({
          data: { session: { access_token: "only-one-field" } },
          error: null,
        }),
      }),
    } as never);

    await expect(api.getSession()).rejects.toMatchObject({
      code: API_ERROR_CODES.invalidResponse,
    });
  });

  it("honors an already-aborted signal without starting auth I/O", async () => {
    const auth = authClient();
    const api = createAuthApi({ auth } as never);
    const controller = new AbortController();
    controller.abort();

    await expect(
      api.signInWithPassword("person@example.com", "secret", {
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ code: API_ERROR_CODES.aborted });
    expect(auth.signInWithPassword).not.toHaveBeenCalled();
  });

  it("starts password recovery with a typed redirect option", async () => {
    const resetPasswordForEmail = vi
      .fn()
      .mockResolvedValue({ data: {}, error: null });
    const auth = authClient({ resetPasswordForEmail });
    const api = createAuthApi({ auth } as never);

    await expect(
      api.resetPasswordForEmail("person@example.com", {
        redirectTo: "https://app.example.com/auth/recovery",
      }),
    ).resolves.toBeUndefined();
    expect(resetPasswordForEmail).toHaveBeenCalledWith("person@example.com", {
      redirectTo: "https://app.example.com/auth/recovery",
    });
  });

  it("exchanges a PKCE recovery code without exposing session tokens", async () => {
    const exchangeCodeForSession = vi.fn().mockResolvedValue({
      data: { session: wireSession, user: wireUser, redirectType: "recovery" },
      error: null,
    });
    const auth = authClient({ exchangeCodeForSession });
    const api = createAuthApi({ auth } as never);

    const session = await api.exchangeCodeForSession("one-time-recovery-code");

    expect(exchangeCodeForSession).toHaveBeenCalledWith(
      "one-time-recovery-code",
    );
    expect(session).toEqual({
      expiresAt: 1_800_000_000,
      expiresIn: 3600,
      user: {
        id: wireUser.id,
        email: wireUser.email,
        metadata: { locale: "zh-CN" },
        createdAt: wireUser.created_at,
      },
    });
    expect(session).not.toHaveProperty("accessToken");
    expect(session).not.toHaveProperty("refreshToken");
  });

  it("normalizes PKCE exchange errors", async () => {
    const api = createAuthApi({
      auth: authClient({
        exchangeCodeForSession: vi.fn().mockResolvedValue({
          data: { session: null },
          error: {
            code: "flow_state_not_found",
            message: "PKCE flow state not found",
            status: 400,
            name: "AuthApiError",
          },
        }),
      }),
    } as never);

    await expect(
      api.exchangeCodeForSession("expired-code"),
    ).rejects.toMatchObject({
      code: "flow_state_not_found",
      status: 400,
    });
  });

  it("rejects malformed PKCE sessions at the boundary", async () => {
    const api = createAuthApi({
      auth: authClient({
        exchangeCodeForSession: vi.fn().mockResolvedValue({
          data: { session: { access_token: "incomplete" } },
          error: null,
        }),
      }),
    } as never);

    await expect(
      api.exchangeCodeForSession("recovery-code"),
    ).rejects.toMatchObject({
      code: API_ERROR_CODES.invalidResponse,
    });
  });

  it("updates the recovered user's password and parses the returned user", async () => {
    const updateUser = vi.fn().mockResolvedValue({
      data: { user: wireUser },
      error: null,
    });
    const auth = authClient({ updateUser });
    const api = createAuthApi({ auth } as never);

    await expect(
      api.updatePassword("new-secure-password"),
    ).resolves.toMatchObject({
      id: wireUser.id,
      email: wireUser.email,
    });
    expect(updateUser).toHaveBeenCalledWith({
      password: "new-secure-password",
    });
  });

  it("parses PASSWORD_RECOVERY sessions before notifying auth-state listeners", () => {
    let callback: ((event: string, session: unknown) => void) | undefined;
    const unsubscribe = vi.fn();
    const auth = authClient({
      onAuthStateChange: vi.fn((listener) => {
        callback = listener;
        return { data: { subscription: { unsubscribe } } };
      }),
    });
    const api = createAuthApi({ auth } as never);
    const listener = vi.fn();

    const subscription = api.onAuthStateChange(listener);
    callback?.("PASSWORD_RECOVERY", wireSession);

    expect(listener).toHaveBeenCalledWith(
      "PASSWORD_RECOVERY",
      expect.objectContaining({
        expiresAt: 1_800_000_000,
        user: expect.objectContaining({ id: wireUser.id }),
      }),
    );
    subscription.unsubscribe();
    expect(unsubscribe).toHaveBeenCalledOnce();
  });
});
