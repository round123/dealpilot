import { expect, test, type Browser, type Page } from "@playwright/test";

type PreviewEnvironment = {
  url: string;
  anonKey: string;
  alpha: Credentials;
  beta: Credentials;
};

type Credentials = {
  email: string;
  password: string;
};

type UserSession = {
  access_token: string;
  user: { id: string };
};

type CustomerDetail = {
  id: string;
  contacts: Array<{ id: string; company_id: string }>;
  social_accounts: Array<{ id: string; company_id: string }>;
  deals: Array<{ id: string; company_id: string }>;
  recent_follow_ups: Array<{ id: string; company_id: string }>;
  open_reminders: Array<{
    id: string;
    company_id: string;
    status: string;
    resolution: string | null;
  }>;
};

type AuthenticatedRequest = (
  path: string,
  init?: RequestInit,
) => Promise<Response>;

const requiredEnvironment = (name: string) => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
};

const requirePreviewEnvironment = (): PreviewEnvironment => {
  const url = new URL(requiredEnvironment("SUPABASE_URL"));
  if (url.protocol !== "https:") {
    throw new Error(
      `Hosted Preview E2E requires HTTPS Supabase, received ${url.origin}`,
    );
  }
  return {
    url: url.origin,
    anonKey: requiredEnvironment("SUPABASE_ANON_KEY"),
    alpha: {
      email: requiredEnvironment("PREVIEW_E2E_ALPHA_EMAIL"),
      password: requiredEnvironment("PREVIEW_E2E_ALPHA_PASSWORD"),
    },
    beta: {
      email: requiredEnvironment("PREVIEW_E2E_BETA_EMAIL"),
      password: requiredEnvironment("PREVIEW_E2E_BETA_PASSWORD"),
    },
  };
};

test("hosted Preview preserves account isolation and the Customer vertical slice", async ({
  browser,
}) => {
  const environment = requirePreviewEnvironment();
  const suffix = `preview-${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 8)}`;
  const alphaSession = await signIn(environment, environment.alpha);
  const betaSession = await signIn(environment, environment.beta);
  expect(alphaSession.user.id).not.toBe(betaSession.user.id);

  const asAlpha = authenticatedRequest(environment, alphaSession);
  const asBeta = authenticatedRequest(environment, betaSession);
  const targetId = crypto.randomUUID();
  const sourceId = crypto.randomUUID();
  const betaCustomerId = crypto.randomUUID();
  const contactId = crypto.randomUUID();
  const socialAccountId = crypto.randomUUID();
  const dealId = crypto.randomUUID();
  const followUpId = crypto.randomUUID();
  const reminderId = crypto.randomUUID();
  const crossOwnerContactId = crypto.randomUUID();
  const forgedCustomerId = crypto.randomUUID();
  const targetName = `Preview Alpha ${suffix}`;
  const sourceName = `Preview Merge ${suffix}`;
  const betaCustomerName = `Preview Beta ${suffix}`;
  const storagePath = `${alphaSession.user.id}/${suffix}/proof.txt`;
  const forbiddenStoragePath = `${betaSession.user.id}/${suffix}/forbidden.txt`;
  let ownStorageCreated = false;
  let forbiddenStorageCreated = false;
  let forgedCustomerCreated = false;

  try {
    await insert(asAlpha, "companies", [
      { id: targetId, name: targetName, company: `Target ${suffix}` },
      { id: sourceId, name: sourceName, company: `Source ${suffix}` },
    ]);
    await insert(asBeta, "companies", {
      id: betaCustomerId,
      name: betaCustomerName,
    });

    await test.step("two real accounts see only their own Customer in the UI", async () => {
      await assertBrowserCustomerIsolation(
        browser,
        environment.alpha,
        targetName,
        betaCustomerName,
      );
      await assertBrowserCustomerIsolation(
        browser,
        environment.beta,
        betaCustomerName,
        targetName,
      );
    });

    await test.step("REST RLS and composite parent constraints reject cross-account access", async () => {
      expect(
        await expectJson<unknown[]>(
          await asAlpha(
            `/rest/v1/companies?id=eq.${betaCustomerId}&select=id,name`,
          ),
          200,
        ),
      ).toEqual([]);

      const crossOwnerChild = await asAlpha("/rest/v1/contacts", {
        method: "POST",
        headers: { prefer: "return=representation" },
        body: JSON.stringify({
          id: crossOwnerContactId,
          company_id: betaCustomerId,
          name: `Forbidden ${suffix}`,
        }),
      });
      expect(crossOwnerChild.ok).toBe(false);
      expect(await crossOwnerChild.json()).toMatchObject({ code: "23503" });

      const forgedOwner = await asAlpha("/rest/v1/companies", {
        method: "POST",
        headers: { prefer: "return=representation" },
        body: JSON.stringify({
          id: forgedCustomerId,
          owner_user_id: betaSession.user.id,
          name: `Forged ${suffix}`,
        }),
      });
      forgedCustomerCreated = forgedOwner.ok;
      expect(forgedOwner.ok).toBe(false);
      expect(await forgedOwner.json()).toMatchObject({ code: "42501" });

      const purge = await asAlpha("/functions/v1/purge-expired-customers", {
        method: "POST",
        body: "{}",
      });
      expect(purge.status).toBe(403);
      expect(await purge.json()).toMatchObject({
        error: { code: "FORBIDDEN", message: "Service role required" },
      });
    });

    await test.step("Storage accepts the owner prefix and rejects the other account prefix", async () => {
      const ownUpload = await asAlpha(
        `/storage/v1/object/attachments/${storagePath}`,
        {
          method: "POST",
          headers: { "content-type": "text/plain", "x-upsert": "false" },
          body: `Preview storage ${suffix}`,
        },
      );
      expect(ownUpload.status, await ownUpload.text()).toBe(200);
      ownStorageCreated = true;

      const crossOwnerUpload = await asAlpha(
        `/storage/v1/object/attachments/${forbiddenStoragePath}`,
        {
          method: "POST",
          headers: { "content-type": "text/plain", "x-upsert": "false" },
          body: "must not cross the account boundary",
        },
      );
      forbiddenStorageCreated = crossOwnerUpload.ok;
      expect(crossOwnerUpload.ok).toBe(false);
      expect([400, 403]).toContain(crossOwnerUpload.status);
    });

    await test.step("Customer detail, merge, soft delete, and restore use real RPCs", async () => {
      const future = new Date(Date.now() + 86_400_000).toISOString();
      const originalResolution = `pending-${suffix}`;
      await insert(asAlpha, "contacts", {
        id: contactId,
        company_id: sourceId,
        name: `Contact ${suffix}`,
      });
      await insert(asAlpha, "social_accounts", {
        id: socialAccountId,
        company_id: sourceId,
        contact_id: contactId,
        platform: "wechat",
        raw_identifier: `wx-${suffix}`,
        normalized_identifier: `wx-${suffix}`,
      });
      await insert(asAlpha, "deals", {
        id: dealId,
        company_id: sourceId,
        name: `Deal ${suffix}`,
      });
      await insert(asAlpha, "follow_ups", {
        id: followUpId,
        company_id: sourceId,
        deal_id: dealId,
        type: "note",
        note: `Follow-up ${suffix}`,
        occurred_at: new Date().toISOString(),
      });
      await insert(asAlpha, "reminders", {
        id: reminderId,
        company_id: sourceId,
        deal_id: dealId,
        type: "fixed_time",
        status: "pending",
        due_at: future,
        priority: "normal",
        resolution: originalResolution,
      });

      const sourceDetail = await rpc<{ data: CustomerDetail }>(
        asAlpha,
        "get_customer_detail",
        { p_customer_id: sourceId },
      );
      expectCustomerAssociations(sourceDetail.data, {
        customerId: sourceId,
        contactId,
        socialAccountId,
        dealId,
        followUpId,
        reminderId,
      });

      await rpc(asAlpha, "merge_customers", {
        p_source_id: sourceId,
        p_target_id: targetId,
        p_field_resolutions: { company: `Merged ${suffix}` },
      });
      expect(
        await expectJson<Array<{ id: string; company_id: string }>>(
          await asAlpha(
            `/rest/v1/contacts?id=eq.${contactId}&select=id,company_id`,
          ),
          200,
        ),
      ).toEqual([{ id: contactId, company_id: targetId }]);

      const mergedDetail = await rpc<{ data: CustomerDetail }>(
        asAlpha,
        "get_customer_detail",
        { p_customer_id: targetId },
      );
      expectCustomerAssociations(mergedDetail.data, {
        customerId: targetId,
        contactId,
        socialAccountId,
        dealId,
        followUpId,
        reminderId,
      });

      await rpc(asAlpha, "soft_delete_customer", {
        p_customer_id: targetId,
      });
      expect(await readReminder(asAlpha, reminderId)).toEqual({
        id: reminderId,
        status: "ignored",
        resolution: "Customer deleted",
        deletion_event_id: expect.any(String),
      });

      await rpc(asAlpha, "restore_customer", { p_customer_id: targetId });
      expect(await readReminder(asAlpha, reminderId)).toEqual({
        id: reminderId,
        status: "pending",
        resolution: originalResolution,
        deletion_event_id: null,
      });
      expect(
        await rpc<{ data: CustomerDetail }>(asAlpha, "get_customer_detail", {
          p_customer_id: targetId,
        }),
      ).toMatchObject({ data: { id: targetId } });
    });

    await test.step("self-service account deletion stays hidden and disabled", async () => {
      const context = await browser.newContext();
      const page = await context.newPage();
      try {
        await login(page, environment.alpha);
        await page.goto("/#/settings");
        await expect(
          page.getByRole("button", {
            name: /delete account|close account|删除账户|注销账户/i,
          }),
        ).toHaveCount(0);
      } finally {
        await context.close();
      }

      const requestId = `preview-delete-${suffix}`;
      const deleteAccount = await asAlpha("/functions/v1/delete-account", {
        method: "POST",
        headers: { "x-request-id": requestId },
        body: JSON.stringify({ user_id: betaSession.user.id }),
      });
      expect(
        await expectJson<{
          error: { code: string; message: string; request_id: string };
        }>(deleteAccount, 404),
      ).toEqual({
        error: {
          code: "FEATURE_DISABLED",
          message: "Self-service account deletion is not available",
          request_id: requestId,
        },
      });
      expect(deleteAccount.headers.get("x-request-id")).toBe(requestId);
    });
  } finally {
    const cleanupResults: Promise<Response>[] = [];
    if (ownStorageCreated) {
      cleanupResults.push(
        asAlpha(`/storage/v1/object/attachments/${storagePath}`, {
          method: "DELETE",
          body: "{}",
        }),
      );
    }
    if (forbiddenStorageCreated) {
      cleanupResults.push(
        asBeta(`/storage/v1/object/attachments/${forbiddenStoragePath}`, {
          method: "DELETE",
          body: "{}",
        }),
      );
    }
    cleanupResults.push(
      asAlpha(`/rest/v1/contacts?id=eq.${crossOwnerContactId}`, {
        method: "DELETE",
      }),
      asAlpha(`/rest/v1/companies?id=in.(${targetId},${sourceId})`, {
        method: "DELETE",
      }),
      asBeta(`/rest/v1/companies?id=eq.${betaCustomerId}`, {
        method: "DELETE",
      }),
    );
    if (forgedCustomerCreated) {
      cleanupResults.push(
        asBeta(`/rest/v1/companies?id=eq.${forgedCustomerId}`, {
          method: "DELETE",
        }),
      );
    }
    const responses = await Promise.all(cleanupResults);
    for (const response of responses) {
      expect(
        response.ok,
        `Preview E2E cleanup failed with HTTP ${response.status}: ${await response.text()}`,
      ).toBe(true);
    }
  }
});

const authenticatedRequest = (
  environment: Pick<PreviewEnvironment, "url" | "anonKey">,
  session: UserSession,
): AuthenticatedRequest => {
  const headers = {
    apikey: environment.anonKey,
    authorization: `Bearer ${session.access_token}`,
    "content-type": "application/json",
  };
  return (path, init = {}) =>
    fetch(new URL(path, environment.url), {
      ...init,
      headers: { ...headers, ...init.headers },
    });
};

const signIn = async (
  environment: Pick<PreviewEnvironment, "url" | "anonKey">,
  credentials: Credentials,
) =>
  expectJson<UserSession>(
    await fetch(
      new URL("/auth/v1/token?grant_type=password", environment.url),
      {
        method: "POST",
        headers: {
          apikey: environment.anonKey,
          "content-type": "application/json",
        },
        body: JSON.stringify(credentials),
      },
    ),
    200,
  );

const login = async (page: Page, credentials: Credentials) => {
  await page.goto("/#/login");
  await page.locator('input[type="email"]').fill(credentials.email);
  await page.locator('input[type="password"]').fill(credentials.password);
  await page.getByRole("button", { name: /sign in|登录/i }).click();
  await expect(page).not.toHaveURL(/#\/login(?:$|[/?])/);
};

const assertBrowserCustomerIsolation = async (
  browser: Browser,
  credentials: Credentials,
  ownCustomerName: string,
  otherCustomerName: string,
) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await login(page, credentials);
    await page.goto("/#/companies");
    const search = page.getByPlaceholder(/search|搜索/i).first();
    await expect(search).toBeVisible();
    await search.fill(ownCustomerName);
    await expect(
      page.getByText(ownCustomerName, { exact: true }).first(),
    ).toBeVisible();
    await search.fill(otherCustomerName);
    await expect(page.getByText(ownCustomerName, { exact: true })).toHaveCount(
      0,
    );
    await expect(
      page.getByText(otherCustomerName, { exact: true }),
    ).toHaveCount(0);
  } finally {
    await context.close();
  }
};

const insert = async (
  request: AuthenticatedRequest,
  resource: string,
  body: unknown,
) =>
  expectJson(
    await request(`/rest/v1/${resource}`, {
      method: "POST",
      headers: { prefer: "return=representation" },
      body: JSON.stringify(body),
    }),
    201,
  );

const rpc = async <T = unknown>(
  request: AuthenticatedRequest,
  name: string,
  body: unknown,
) =>
  expectJson<T>(
    await request(`/rest/v1/rpc/${name}`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
    200,
  );

const readReminder = async (
  request: AuthenticatedRequest,
  reminderId: string,
) => {
  const rows = await expectJson<
    Array<{
      id: string;
      status: string;
      resolution: string | null;
      deletion_event_id: string | null;
    }>
  >(
    await request(
      `/rest/v1/reminders?id=eq.${reminderId}&select=id,status,resolution,deletion_event_id`,
    ),
    200,
  );
  expect(rows).toHaveLength(1);
  return rows[0];
};

const expectCustomerAssociations = (
  detail: CustomerDetail,
  expected: {
    customerId: string;
    contactId: string;
    socialAccountId: string;
    dealId: string;
    followUpId: string;
    reminderId: string;
  },
) => {
  expect(detail.id).toBe(expected.customerId);
  for (const [records, id] of [
    [detail.contacts, expected.contactId],
    [detail.social_accounts, expected.socialAccountId],
    [detail.deals, expected.dealId],
    [detail.recent_follow_ups, expected.followUpId],
    [detail.open_reminders, expected.reminderId],
  ] as const) {
    expect(records).toContainEqual(
      expect.objectContaining({ id, company_id: expected.customerId }),
    );
  }
};

const expectJson = async <T>(
  response: Response,
  status: number,
): Promise<T> => {
  const text = await response.text();
  expect(response.status, text).toBe(status);
  return JSON.parse(text) as T;
};
