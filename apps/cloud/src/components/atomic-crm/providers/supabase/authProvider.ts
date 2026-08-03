import type { AuthProvider } from "ra-core";

import { personalAccount, type PersonalAccountApi } from "../personalAccount";

export type PersonalAuthProvider = AuthProvider & {
  resetPassword(params: { email: string; redirectTo?: string }): Promise<void>;
  setPassword(params: {
    code: string;
    password: string;
    signal?: AbortSignal;
  }): Promise<void>;
};

const isPublicAuthRoute = () =>
  ["/sign-up", "/forgot-password", "/set-password", "/privacy", "/terms"].some(
    (path) =>
      window.location.pathname === path ||
      window.location.hash.includes(`#${path}`),
  );

export const createPersonalAuthProvider = ({
  account = personalAccount,
}: {
  account?: PersonalAccountApi;
} = {}): PersonalAuthProvider => ({
  async login(params) {
    if (!params?.email || !params?.password) {
      throw new Error("crm.auth.email_password_required");
    }
    await account.signIn(params.email, params.password);
  },

  async logout() {
    await account.signOut();
  },

  async checkAuth() {
    if (isPublicAuthRoute()) return;
    if (!(await account.hasSession())) return Promise.reject();
  },

  async checkError(error) {
    if (error?.status === 401 || error?.status === 403) {
      return Promise.reject();
    }
  },

  getIdentity() {
    return account.getIdentity();
  },

  async canAccess({ resource }) {
    return resource !== "sales";
  },

  async handleCallback(params) {
    const code = new URLSearchParams(window.location.search).get("code");
    if (!code) throw new Error("crm.auth.missing_authorization_code");
    await account.exchangeCodeForSession(code, params?.signal);
  },

  resetPassword({ email, redirectTo }) {
    return account.resetPassword(email, redirectTo);
  },

  async setPassword({ code, password, signal }) {
    await account.exchangeCodeForSession(code, signal);
    await account.updatePassword(password, signal);
  },
});

export const getAuthProvider = () => createPersonalAuthProvider();
