import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import {
  API_ERROR_CODES,
  ApiError,
  errorCodeForStatus,
  normalizeThrownError,
} from "./error.js";

const AuthUserWireSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email().nullable().optional(),
  user_metadata: z.record(z.unknown()).optional(),
  created_at: z.string().optional(),
});

const AuthSessionWireSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1),
  expires_at: z.number().int().optional(),
  expires_in: z.number().int().optional(),
  token_type: z.string().min(1),
  user: AuthUserWireSchema,
});

export interface AuthUser {
  id: string;
  email?: string | null;
  metadata: Readonly<Record<string, unknown>>;
  createdAt?: string;
}

export interface AuthSession {
  expiresAt?: number;
  expiresIn?: number;
  user: AuthUser;
}

export interface SignUpResult {
  user: AuthUser | null;
  session: AuthSession | null;
}

export type AuthChangeEvent =
  | "INITIAL_SESSION"
  | "SIGNED_IN"
  | "SIGNED_OUT"
  | "TOKEN_REFRESHED"
  | "USER_UPDATED"
  | "PASSWORD_RECOVERY"
  | "MFA_CHALLENGE_VERIFIED"
  | "UNKNOWN";

export type AuthStateListener = (
  event: AuthChangeEvent,
  session: AuthSession | null,
  error?: ApiError,
) => void;

export interface AuthSubscription {
  unsubscribe(): void;
}

export interface AuthRequestOptions {
  signal?: AbortSignal;
}

export interface SignUpOptions extends AuthRequestOptions {
  emailRedirectTo?: string;
  metadata?: Record<string, unknown>;
}

export interface ResetPasswordOptions extends AuthRequestOptions {
  redirectTo?: string;
}

export interface AuthApi {
  signInWithPassword(
    email: string,
    password: string,
    options?: AuthRequestOptions,
  ): Promise<AuthSession>;
  signUp(
    email: string,
    password: string,
    options?: SignUpOptions,
  ): Promise<SignUpResult>;
  resetPasswordForEmail(
    email: string,
    options?: ResetPasswordOptions,
  ): Promise<void>;
  exchangeCodeForSession(
    code: string,
    options?: AuthRequestOptions,
  ): Promise<AuthSession>;
  updatePassword(
    password: string,
    options?: AuthRequestOptions,
  ): Promise<AuthUser>;
  signOut(options?: AuthRequestOptions): Promise<void>;
  getSession(options?: AuthRequestOptions): Promise<AuthSession | null>;
  onAuthStateChange(listener: AuthStateListener): AuthSubscription;
}

interface AuthErrorLike {
  message: string;
  status?: number;
  code?: string;
  name?: string;
  request_id?: string;
}

interface AuthResultLike {
  data: unknown;
  error: AuthErrorLike | null;
}

interface AuthClientLike {
  signInWithPassword(credentials: {
    email: string;
    password: string;
  }): Promise<AuthResultLike>;
  signUp(credentials: {
    email: string;
    password: string;
    options?: { emailRedirectTo?: string; data?: Record<string, unknown> };
  }): Promise<AuthResultLike>;
  resetPasswordForEmail(
    email: string,
    options?: { redirectTo?: string },
  ): Promise<AuthResultLike>;
  exchangeCodeForSession(code: string): Promise<AuthResultLike>;
  updateUser(attributes: { password: string }): Promise<AuthResultLike>;
  signOut(): Promise<AuthResultLike>;
  getSession(): Promise<AuthResultLike>;
  onAuthStateChange(callback: (event: string, session: unknown) => void): {
    data: { subscription: AuthSubscription };
  };
}

function parseUser(value: unknown): AuthUser {
  const parsed = AuthUserWireSchema.safeParse(value);
  if (!parsed.success) {
    throw new ApiError({
      code: API_ERROR_CODES.invalidResponse,
      message: "Auth user did not match the expected contract",
      details: parsed.error.issues,
      cause: parsed.error,
    });
  }

  return {
    id: parsed.data.id,
    email: parsed.data.email,
    metadata: parsed.data.user_metadata ?? {},
    createdAt: parsed.data.created_at,
  };
}

function parseSession(value: unknown): AuthSession {
  const parsed = AuthSessionWireSchema.safeParse(value);
  if (!parsed.success) {
    throw new ApiError({
      code: API_ERROR_CODES.invalidResponse,
      message: "Auth session did not match the expected contract",
      details: parsed.error.issues,
      cause: parsed.error,
    });
  }

  return {
    expiresAt: parsed.data.expires_at,
    expiresIn: parsed.data.expires_in,
    user: parseUser(parsed.data.user),
  };
}

function authError(error: AuthErrorLike): ApiError {
  const status = error.status ?? 0;
  return new ApiError({
    code:
      error.code ||
      (status === 0 ? API_ERROR_CODES.unknown : errorCodeForStatus(status)),
    message: error.message,
    status,
    requestId: error.request_id,
    details: { authErrorName: error.name },
    cause: error,
  });
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw normalizeThrownError(signal.reason, signal);
}

async function executeAuth(
  request: () => Promise<AuthResultLike>,
  signal?: AbortSignal,
): Promise<unknown> {
  throwIfAborted(signal);
  try {
    const result = await request();
    throwIfAborted(signal);
    if (result.error !== null) throw authError(result.error);
    return result.data;
  } catch (error) {
    throw normalizeThrownError(error, signal);
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null) {
    throw new ApiError({
      code: API_ERROR_CODES.invalidResponse,
      message: "Auth response was not an object",
      details: value,
    });
  }
  return value as Record<string, unknown>;
}

function normalizeAuthEvent(event: string): AuthChangeEvent {
  const knownEvents: readonly AuthChangeEvent[] = [
    "INITIAL_SESSION",
    "SIGNED_IN",
    "SIGNED_OUT",
    "TOKEN_REFRESHED",
    "USER_UPDATED",
    "PASSWORD_RECOVERY",
    "MFA_CHALLENGE_VERIFIED",
  ];
  return knownEvents.includes(event as AuthChangeEvent)
    ? (event as AuthChangeEvent)
    : "UNKNOWN";
}

export function createAuthApi(client: SupabaseClient): AuthApi {
  const auth = (client as unknown as { auth: AuthClientLike }).auth;

  return {
    async signInWithPassword(email, password, options = {}) {
      const data = asRecord(
        await executeAuth(
          () => auth.signInWithPassword({ email, password }),
          options.signal,
        ),
      );
      return parseSession(data.session);
    },

    async signUp(email, password, options = {}) {
      const data = asRecord(
        await executeAuth(
          () =>
            auth.signUp({
              email,
              password,
              options: {
                emailRedirectTo: options.emailRedirectTo,
                data: options.metadata,
              },
            }),
          options.signal,
        ),
      );
      return {
        user: data.user === null ? null : parseUser(data.user),
        session: data.session === null ? null : parseSession(data.session),
      };
    },

    async resetPasswordForEmail(email, options = {}) {
      await executeAuth(
        () =>
          auth.resetPasswordForEmail(email, { redirectTo: options.redirectTo }),
        options.signal,
      );
    },

    async exchangeCodeForSession(code, options = {}) {
      const data = asRecord(
        await executeAuth(
          () => auth.exchangeCodeForSession(code),
          options.signal,
        ),
      );
      return parseSession(data.session);
    },

    async updatePassword(password, options = {}) {
      const data = asRecord(
        await executeAuth(() => auth.updateUser({ password }), options.signal),
      );
      return parseUser(data.user);
    },

    async signOut(options = {}) {
      await executeAuth(() => auth.signOut(), options.signal);
    },

    async getSession(options = {}) {
      const data = asRecord(
        await executeAuth(() => auth.getSession(), options.signal),
      );
      return data.session === null ? null : parseSession(data.session);
    },

    onAuthStateChange(listener) {
      const result = auth.onAuthStateChange((event, session) => {
        let parsedSession: AuthSession | null;
        try {
          parsedSession = session === null ? null : parseSession(session);
        } catch (error) {
          listener("UNKNOWN", null, normalizeThrownError(error));
          return;
        }
        listener(normalizeAuthEvent(event), parsedSession);
      });
      return result.data.subscription;
    },
  };
}
