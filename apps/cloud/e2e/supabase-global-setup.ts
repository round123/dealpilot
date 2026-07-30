import type { FullConfig } from "@playwright/test";
import {
  requireSupabaseAdminEnvironment,
  SUPABASE_E2E_USERS,
} from "./supabase-test-env";

type AdminUser = {
  id: string;
  email?: string;
};

const readJson = async <T>(
  response: Response,
  operation: string,
): Promise<T> => {
  const text = await response.text();
  if (!response.ok) {
    throw new Error(
      `${operation} failed with HTTP ${response.status}: ${text}`,
    );
  }
  return (text ? JSON.parse(text) : {}) as T;
};

export default async function globalSetup(_config: FullConfig) {
  const { url, serviceRoleKey } = requireSupabaseAdminEnvironment();
  const adminHeaders = {
    apikey: serviceRoleKey,
    authorization: `Bearer ${serviceRoleKey}`,
    "content-type": "application/json",
  };
  const adminFetch = (path: string, init: RequestInit = {}) =>
    fetch(new URL(path, url), {
      ...init,
      headers: { ...adminHeaders, ...init.headers },
    });

  const listed = await readJson<{ users?: AdminUser[] }>(
    await adminFetch("/auth/v1/admin/users?page=1&per_page=1000"),
    "List local test users",
  );
  const testEmails = new Set(
    Object.values(SUPABASE_E2E_USERS).map(({ email }) => email),
  );
  for (const user of listed.users ?? []) {
    if (user.email && testEmails.has(user.email)) {
      await deleteUser(adminFetch, user.id);
    }
  }

  const createdUsers: AdminUser[] = [];
  try {
    for (const fixture of Object.values(SUPABASE_E2E_USERS)) {
      const payload = await readJson<AdminUser | { user: AdminUser }>(
        await adminFetch("/auth/v1/admin/users", {
          method: "POST",
          body: JSON.stringify({
            email: fixture.email,
            password: fixture.password,
            email_confirm: true,
            user_metadata: { display_name: fixture.displayName },
          }),
        }),
        `Create local test user ${fixture.email}`,
      );
      const user = "user" in payload ? payload.user : payload;
      if (!user.id)
        throw new Error(`Admin API did not return an ID for ${fixture.email}`);
      createdUsers.push(user);
    }

    const [alpha, beta] = createdUsers;
    process.env.SUPABASE_E2E_ALPHA_USER_ID = alpha.id;
    process.env.SUPABASE_E2E_BETA_USER_ID = beta.id;

    await readJson(
      await adminFetch("/rest/v1/companies", {
        method: "POST",
        headers: { prefer: "return=minimal" },
        body: JSON.stringify([
          {
            id: SUPABASE_E2E_USERS.alpha.customerId,
            owner_user_id: alpha.id,
            name: SUPABASE_E2E_USERS.alpha.customerName,
          },
          {
            id: SUPABASE_E2E_USERS.beta.customerId,
            owner_user_id: beta.id,
            name: SUPABASE_E2E_USERS.beta.customerName,
          },
        ]),
      }),
      "Seed isolated Customers",
    );
  } catch (error) {
    await Promise.allSettled(
      createdUsers.map((user) => deleteUser(adminFetch, user.id)),
    );
    throw error;
  }

  return async () => {
    await Promise.allSettled(
      createdUsers.map((user) => deleteUser(adminFetch, user.id)),
    );
  };
}

const deleteUser = async (
  adminFetch: (path: string, init?: RequestInit) => Promise<Response>,
  userId: string,
) => {
  const response = await adminFetch(`/auth/v1/admin/users/${userId}`, {
    method: "DELETE",
  });
  if (!response.ok && response.status !== 404) {
    await readJson(response, `Delete local test user ${userId}`);
  }
};
