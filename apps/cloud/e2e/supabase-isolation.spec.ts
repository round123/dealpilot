import { expect, test, type Browser, type Page } from "@playwright/test";
import {
  requireSeededUserIds,
  requireSupabasePublicEnvironment,
  SUPABASE_E2E_USERS,
} from "./supabase-test-env";

type UserSession = {
  access_token: string;
  user: { id: string };
};

const NETWORK_RETRY_DELAYS_MS = [200, 500] as const;
const RETRYABLE_NETWORK_CODES = new Set([
  "ECONNREFUSED",
  "ECONNRESET",
  "EPIPE",
  "ETIMEDOUT",
  "UND_ERR_BODY_TIMEOUT",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_HEADERS_TIMEOUT",
  "UND_ERR_SOCKET",
]);

const isRetryableNetworkError = (error: unknown): boolean => {
  if (!error || typeof error !== "object") return false;
  if (error instanceof DOMException && error.name === "AbortError") return false;

  if (error instanceof TypeError && error.message === "fetch failed") {
    return true;
  }

  const code = "code" in error ? error.code : undefined;
  if (typeof code === "string" && RETRYABLE_NETWORK_CODES.has(code)) {
    return true;
  }

  return "cause" in error && isRetryableNetworkError(error.cause);
};

const fetchSupabase = async (url: URL, init?: RequestInit) => {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await fetch(url, init);
    } catch (error) {
      const retryDelay = NETWORK_RETRY_DELAYS_MS[attempt];
      if (retryDelay === undefined || !isRetryableNetworkError(error)) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, retryDelay));
    }
  }
};

test("two local users remain isolated across browser, REST, RPC, Edge, FK, and Storage", async ({
  browser,
}) => {
  test.setTimeout(90_000);
  const environment = requireSupabasePublicEnvironment();
  const userIds = requireSeededUserIds();

  await assertBrowserCustomerIsolation(
    browser,
    SUPABASE_E2E_USERS.alpha,
    SUPABASE_E2E_USERS.beta.customerName,
  );
  await assertBrowserCustomerIsolation(
    browser,
    SUPABASE_E2E_USERS.beta,
    SUPABASE_E2E_USERS.alpha.customerName,
  );

  const alphaSession = await signIn(
    environment,
    SUPABASE_E2E_USERS.alpha.email,
    SUPABASE_E2E_USERS.alpha.password,
  );
  expect(alphaSession.user.id).toBe(userIds.alpha);

  const alphaHeaders = {
    apikey: environment.anonKey,
    authorization: `Bearer ${alphaSession.access_token}`,
    "content-type": "application/json",
  };
  const asAlpha = (path: string, init: RequestInit = {}) =>
    fetchSupabase(new URL(path, environment.url), {
      ...init,
      headers: { ...alphaHeaders, ...init.headers },
    });

  const edgeResponse = await asAlpha("/functions/v1/purge-expired-customers", {
    method: "POST",
    body: "{}",
  });
  expect(edgeResponse.status).toBe(403);
  const edgeError = (await edgeResponse.json()) as {
    error?: { code?: string; message?: string; request_id?: string };
  };
  expect(edgeError).toMatchObject({
    error: {
      code: "FORBIDDEN",
      message: "Service role required",
    },
  });
  expect(edgeError.error?.request_id).toEqual(expect.any(String));
  expect(edgeError.error?.request_id).not.toBe("");
  expect(edgeResponse.headers.get("x-request-id")).toBe(
    edgeError.error?.request_id,
  );

  const ownCustomers = await expectJson<Array<{ id: string; name: string }>>(
    await asAlpha("/rest/v1/companies?select=id,name&order=name.asc"),
    200,
  );
  expect(ownCustomers).toEqual([
    {
      id: SUPABASE_E2E_USERS.alpha.customerId,
      name: SUPABASE_E2E_USERS.alpha.customerName,
    },
  ]);

  const hiddenCustomer = await expectJson<unknown[]>(
    await asAlpha(
      `/rest/v1/companies?id=eq.${SUPABASE_E2E_USERS.beta.customerId}&select=id,name`,
    ),
    200,
  );
  expect(hiddenCustomer).toEqual([]);

  const rpcResponse = await asAlpha("/rest/v1/rpc/get_customer_detail", {
    method: "POST",
    body: JSON.stringify({
      p_customer_id: SUPABASE_E2E_USERS.beta.customerId,
    }),
  });
  expect(rpcResponse.ok).toBe(false);
  expect((await rpcResponse.json()) as { code?: string }).toMatchObject({
    code: "P0002",
  });

  const forgedOwnerResponse = await asAlpha("/rest/v1/companies", {
    method: "POST",
    headers: { prefer: "return=representation" },
    body: JSON.stringify({
      id: "e2e00000-0000-4000-8000-000000000003",
      owner_user_id: userIds.beta,
      name: "Forged owner Customer",
    }),
  });
  expect(forgedOwnerResponse.ok).toBe(false);
  expect((await forgedOwnerResponse.json()) as { code?: string }).toMatchObject(
    {
      code: "42501",
    },
  );

  const crossOwnerChildResponse = await asAlpha("/rest/v1/contacts", {
    method: "POST",
    headers: { prefer: "return=representation" },
    body: JSON.stringify({
      id: "e2e00000-0000-4000-8000-000000000101",
      owner_user_id: userIds.alpha,
      company_id: SUPABASE_E2E_USERS.beta.customerId,
      first_name: "Cross-owner child",
    }),
  });
  expect(crossOwnerChildResponse.ok).toBe(false);
  expect(
    (await crossOwnerChildResponse.json()) as { code?: string },
  ).toMatchObject({ code: "23503" });

  const storageResponse = await fetchSupabase(
    new URL(
      `/storage/v1/object/attachments/${userIds.beta}/forbidden.txt`,
      environment.url,
    ),
    {
      method: "POST",
      headers: {
        apikey: environment.anonKey,
        authorization: `Bearer ${alphaSession.access_token}`,
        "content-type": "text/plain",
        "x-upsert": "false",
      },
      body: "must not cross the user boundary",
    },
  );
  expect(storageResponse.ok).toBe(false);
  expect([400, 403]).toContain(storageResponse.status);
});

test("Auth onboarding creates an isolated profile and configuration", async () => {
  const environment = requireSupabasePublicEnvironment();
  const userIds = requireSeededUserIds();
  const session = await signIn(
    environment,
    SUPABASE_E2E_USERS.alpha.email,
    SUPABASE_E2E_USERS.alpha.password,
  );
  const headers = {
    apikey: environment.anonKey,
    authorization: `Bearer ${session.access_token}`,
    "content-type": "application/json",
  };
  const asAlpha = (path: string, init: RequestInit = {}) =>
    fetchSupabase(new URL(path, environment.url), {
      ...init,
      headers: { ...headers, ...init.headers },
    });

  const profiles = await expectJson<
    Array<{
      id: string;
      display_name: string | null;
      locale: string;
      theme: string;
    }>
  >(
    await asAlpha(
      `/rest/v1/profiles?id=eq.${userIds.alpha}&select=id,display_name,locale,theme`,
    ),
    200,
  );
  expect(profiles).toEqual([
    {
      id: userIds.alpha,
      display_name: SUPABASE_E2E_USERS.alpha.displayName,
      locale: "zh-CN",
      theme: "light",
    },
  ]);

  const configurations = await expectJson<
    Array<{ owner_user_id: string; config: Record<string, unknown> }>
  >(
    await asAlpha(
      `/rest/v1/configuration?owner_user_id=eq.${userIds.alpha}&select=owner_user_id,config`,
    ),
    200,
  );
  expect(configurations).toEqual([
    { owner_user_id: userIds.alpha, config: {} },
  ]);

  const updateResponse = await asAlpha(
    `/rest/v1/profiles?id=eq.${userIds.alpha}&select=id,display_name,locale,theme`,
    {
      method: "PATCH",
      headers: { prefer: "return=representation" },
      body: JSON.stringify({ locale: "en-US", theme: "system" }),
    },
  );
  const updatedProfiles = await expectJson<typeof profiles>(
    updateResponse,
    200,
  );
  expect(updatedProfiles).toEqual([
    {
      id: userIds.alpha,
      display_name: SUPABASE_E2E_USERS.alpha.displayName,
      locale: "en-US",
      theme: "system",
    },
  ]);
});

const assertBrowserCustomerIsolation = async (
  browser: Browser,
  user: (typeof SUPABASE_E2E_USERS)[keyof typeof SUPABASE_E2E_USERS],
  otherCustomerName: string,
) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await login(page, user.email, user.password);
    await page.goto("/#/companies");
    await expect(
      page.getByText(user.customerName, { exact: true }).first(),
    ).toBeVisible();
    await expect(
      page.getByText(otherCustomerName, { exact: true }),
    ).toHaveCount(0);
  } finally {
    await context.close();
  }
};

const login = async (page: Page, email: string, password: string) => {
  await page.goto("/#/login");
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole("button", { name: /sign in|登录/i }).click();
  await expect(page).not.toHaveURL(/#\/login(?:$|[/?])/);
};

const signIn = async (
  environment: { url: string; anonKey: string },
  email: string,
  password: string,
) =>
  expectJson<UserSession>(
    await fetchSupabase(
      new URL("/auth/v1/token?grant_type=password", environment.url),
      {
        method: "POST",
        headers: {
          apikey: environment.anonKey,
          "content-type": "application/json",
        },
        body: JSON.stringify({ email, password }),
      },
    ),
    200,
  );

const expectJson = async <T>(
  response: Response,
  status: number,
): Promise<T> => {
  const text = await response.text();
  expect(response.status, text).toBe(status);
  return JSON.parse(text) as T;
};
