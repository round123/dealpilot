import type { AuthSession, SignUpResult } from "@dealpilot/api-client";
import { z } from "zod/v3";

import type { SignUpData } from "../types";
import { getCloudApiClient } from "./apiClient";

type Profile = {
  id: string;
  display_name: string | null;
  locale: string;
  theme: "light" | "dark" | "system";
};

type ProfileLoader = (
  resource: string,
  id: string,
  schema: unknown,
  options: { select: string },
) => Promise<Profile>;

const ProfileSchema: z.ZodType<Profile> = z.object({
  id: z.string().uuid(),
  display_name: z.string().nullable(),
  locale: z.string(),
  theme: z.enum(["light", "dark", "system"]),
});

export type PersonalIdentity = {
  id: string;
  fullName: string;
  email?: string;
};

export interface PersonalAccountApi {
  signIn(email: string, password: string): Promise<AuthSession>;
  signUp(data: SignUpData): Promise<SignUpResult>;
  signOut(): Promise<void>;
  hasSession(): Promise<boolean>;
  getIdentity(): Promise<PersonalIdentity>;
  resetPassword(email: string, redirectTo?: string): Promise<void>;
  exchangeCodeForSession(code: string, signal?: AbortSignal): Promise<void>;
  updatePassword(password: string, signal?: AbortSignal): Promise<void>;
}

const metadataText = (
  metadata: Readonly<Record<string, unknown>>,
  key: string,
) => {
  const value = metadata[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
};

export const resolveDisplayName = (
  profileName: string | null,
  session: AuthSession,
) => {
  if (profileName?.trim()) return profileName.trim();

  const metadata = session.user.metadata;
  const metadataName =
    metadataText(metadata, "display_name") ??
    metadataText(metadata, "full_name");
  if (metadataName) return metadataName;

  const nameParts = [
    metadataText(metadata, "first_name"),
    metadataText(metadata, "last_name"),
  ].filter(Boolean);
  if (nameParts.length) return nameParts.join(" ");

  return session.user.email ?? "DealPilot user";
};

export const personalAccount: PersonalAccountApi = {
  signIn(email, password) {
    return getCloudApiClient().auth.signInWithPassword(email, password);
  },

  signUp({ email, password, first_name, last_name }) {
    const displayName = [first_name.trim(), last_name.trim()]
      .filter(Boolean)
      .join(" ");
    return getCloudApiClient().auth.signUp(email, password, {
      metadata: {
        display_name: displayName,
        first_name: first_name.trim(),
        last_name: last_name.trim(),
      },
    });
  },

  signOut() {
    return getCloudApiClient().auth.signOut();
  },

  async hasSession() {
    return (await getCloudApiClient().auth.getSession()) !== null;
  },

  async getIdentity() {
    const client = getCloudApiClient();
    const session = await client.auth.getSession();
    if (!session) throw new Error("errors.unauthorized");

    // Isolate the app's Zod 4 compatibility schema from the client's Zod 3 types.
    const loadProfile = client.getOne.bind(client) as ProfileLoader;
    const profile = await loadProfile(
      "profiles",
      session.user.id,
      ProfileSchema,
      { select: "id,display_name,locale,theme" },
    );

    return {
      id: session.user.id,
      fullName: resolveDisplayName(profile.display_name, session),
      email: session.user.email ?? undefined,
    };
  },

  resetPassword(email, redirectTo) {
    return getCloudApiClient().auth.resetPasswordForEmail(email, {
      redirectTo,
    });
  },

  async exchangeCodeForSession(code, signal) {
    await getCloudApiClient().auth.exchangeCodeForSession(code, { signal });
  },

  async updatePassword(password, signal) {
    await getCloudApiClient().auth.updatePassword(password, { signal });
  },

};
