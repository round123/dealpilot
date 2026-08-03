import { describe, expect, it, vi } from "vitest";

import type { PersonalAccountApi } from "../personalAccount";
import { createPersonalAuthProvider } from "./authProvider";

const createAccount = (): PersonalAccountApi => ({
  signIn: vi.fn(),
  signUp: vi.fn(),
  signOut: vi.fn(),
  hasSession: vi.fn().mockResolvedValue(true),
  getIdentity: vi.fn().mockResolvedValue({
    id: "user-id",
    fullName: "Personal User",
    email: "user@example.com",
  }),
  resetPassword: vi.fn(),
  exchangeCodeForSession: vi.fn(),
  updatePassword: vi.fn(),
});

describe("personal auth provider", () => {
  it("uses the personal account facade for login and identity", async () => {
    const account = createAccount();
    const provider = createPersonalAuthProvider({ account });

    await provider.login({ email: "user@example.com", password: "secret" });
    await expect(provider.getIdentity?.()).resolves.toMatchObject({
      id: "user-id",
      fullName: "Personal User",
    });

    expect(account.signIn).toHaveBeenCalledWith("user@example.com", "secret");
    expect(account.getIdentity).toHaveBeenCalledOnce();
  });

  it("returns a translation key when login fields are missing", async () => {
    const provider = createPersonalAuthProvider({
      account: createAccount(),
    });

    await expect(provider.login({ email: "" })).rejects.toThrow(
      "crm.auth.email_password_required",
    );
  });

  it("allows public signup without a global initialization check", async () => {
    window.location.hash = "#/sign-up";
    const account = createAccount();
    const provider = createPersonalAuthProvider({ account });

    await expect(provider.checkAuth({} as never)).resolves.toBeUndefined();
    expect(account.hasSession).not.toHaveBeenCalled();
  });

  it.each(["#/privacy", "#/terms"])(
    "allows the public legal route %s without a session check",
    async (hash) => {
      window.location.hash = hash;
      const account = createAccount();
      const provider = createPersonalAuthProvider({ account });

      await expect(provider.checkAuth({} as never)).resolves.toBeUndefined();
      expect(account.hasSession).not.toHaveBeenCalled();
    },
  );

  it("rejects team user management while allowing personal resources", async () => {
    const provider = createPersonalAuthProvider({
      account: createAccount(),
    });

    await expect(
      provider.canAccess?.({ resource: "sales", action: "list" } as never),
    ).resolves.toBe(false);
    await expect(
      provider.canAccess?.({
        resource: "configuration",
        action: "edit",
      } as never),
    ).resolves.toBe(true);
  });

  it("signs out through the facade", async () => {
    const account = createAccount();
    const provider = createPersonalAuthProvider({ account });

    await provider.logout({});

    expect(account.signOut).toHaveBeenCalledOnce();
  });

  it("exchanges PKCE codes and updates the password through the facade", async () => {
    const account = createAccount();
    const provider = createPersonalAuthProvider({ account });

    await provider.setPassword({
      code: "recovery-code",
      password: "new-secret",
    });

    expect(account.exchangeCodeForSession).toHaveBeenCalledWith(
      "recovery-code",
      undefined,
    );
    expect(account.updatePassword).toHaveBeenCalledWith(
      "new-secret",
      undefined,
    );
  });

  it("handles the top-level PKCE code preserved by the callback bridge", async () => {
    window.history.pushState({}, "", "/?code=pkce-code#/auth-callback");
    const account = createAccount();
    const provider = createPersonalAuthProvider({ account });

    await provider.handleCallback?.({ signal: undefined } as never);

    expect(account.exchangeCodeForSession).toHaveBeenCalledWith(
      "pkce-code",
      undefined,
    );
  });

  it("returns a translation key when an auth callback has no code", async () => {
    window.history.pushState({}, "", "/auth-callback");
    const provider = createPersonalAuthProvider({
      account: createAccount(),
    });

    await expect(
      provider.handleCallback?.({ signal: undefined } as never),
    ).rejects.toThrow("crm.auth.missing_authorization_code");
  });
});
