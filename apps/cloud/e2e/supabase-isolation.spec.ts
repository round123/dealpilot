import { expect, test, type Browser, type Page } from "@playwright/test";
import {
  requireSupabaseAdminEnvironment,
  requireSeededUserIds,
  requireSupabasePublicEnvironment,
  SUPABASE_E2E_USERS,
} from "./supabase-test-env";

type UserSession = {
  access_token: string;
  user: { id: string };
};

type AdminUser = {
  id: string;
  email?: string;
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
    deletion_event_id: string | null;
  }>;
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
  if (error instanceof DOMException && error.name === "AbortError")
    return false;

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

test("Customer behavior remains complete on the real Supabase provider", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const environment = requireSupabasePublicEnvironment();
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
  const insert = async <T>(resource: string, body: unknown) =>
    expectJson<T>(
      await asAlpha(`/rest/v1/${resource}`, {
        method: "POST",
        headers: { prefer: "return=representation" },
        body: JSON.stringify(body),
      }),
      201,
    );
  const rpc = async <T>(name: string, body: unknown) =>
    expectJson<T>(
      await asAlpha(`/rest/v1/rpc/${name}`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
      200,
    );

  const suffix = Date.now().toString(36);
  const searchToken = `vertical${suffix}`;
  const createdTargetName = `Customer ${searchToken}`;
  const targetName = `Updated ${searchToken}`;
  const cursorToken = `cursor${suffix}`;
  const cursorCustomers = Array.from({ length: 26 }, (_, index) => ({
    name: `${cursorToken}-${String(index).padStart(2, "0")}`,
    grade: index % 2 === 0 ? "A" : "B",
    status: "active",
  }));

  await insert<Array<{ id: string }>>("companies", cursorCustomers);

  await login(
    page,
    SUPABASE_E2E_USERS.alpha.email,
    SUPABASE_E2E_USERS.alpha.password,
  );
  await page.goto("/#/companies");
  const searchInput = page.getByPlaceholder(/搜索/i);
  await searchInput.fill(cursorToken);
  await expect(
    page.getByText(`${cursorToken}-00`, { exact: true }),
  ).toBeVisible();

  await page.getByRole("button", { name: "A", exact: true }).click();
  await expect(
    page.getByText(`${cursorToken}-00`, { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText(`${cursorToken}-01`, { exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "A", exact: true }).click();

  await page
    .getByRole("button", {
      name: "按创建时间降序排列",
      exact: true,
    })
    .click();
  await page.getByRole("menuitem", { name: /客户名称.*升序/ }).click();
  await expect(
    page.getByText(`${cursorToken}-00`, { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText(`${cursorToken}-25`, { exact: true }),
  ).toHaveCount(0);
  await page.getByRole("link", { name: "下一页", exact: true }).click();
  await expect(
    page.getByText(`${cursorToken}-25`, { exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "上一页", exact: true }).click();
  await expect(
    page.getByText(`${cursorToken}-00`, { exact: true }),
  ).toBeVisible();

  await page.goto("/#/companies/create");
  await page.locator('input[name="name"]').fill(createdTargetName);
  await page.getByRole("button", { name: /create customer|创建客户/i }).click();
  await expect(page).toHaveURL(/#\/companies\/[^/]+\/show/);

  const targetIdMatch = page.url().match(/#\/companies\/([^/]+)\/show/);
  expect(targetIdMatch).not.toBeNull();
  const targetId = decodeURIComponent(targetIdMatch![1]);
  expect(targetId).toMatch(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
  );

  await page.goto(`/#/companies/${targetId}`);
  await page.locator('input[name="name"]').fill(targetName);
  await page.getByRole("button", { name: /保存/i }).click();
  await expect(page).toHaveURL(
    new RegExp(`#\/companies\/${targetId}\/show(?:\/.*)?$`),
  );
  await expect(
    page.getByRole("heading", { name: targetName, exact: true }),
  ).toBeVisible();

  await page.goto("/#/companies");
  const updatedSearchInput = page.getByPlaceholder(/搜索/i);
  await expect(updatedSearchInput).toHaveValue(cursorToken);
  await expect(
    page.getByText(`${cursorToken}-00`, { exact: true }),
  ).toBeVisible();
  await updatedSearchInput.fill(searchToken);
  await expect(updatedSearchInput).toHaveValue(searchToken);
  await expect(
    page.getByText(targetName, { exact: true }).first(),
  ).toBeVisible();
  await expect(page.getByText(createdTargetName, { exact: true })).toHaveCount(
    0,
  );

  const sourceId = crypto.randomUUID();
  const contactId = crypto.randomUUID();
  const targetContactId = crypto.randomUUID();
  const contactNoteId = crypto.randomUUID();
  const contactTaskId = crypto.randomUUID();
  const socialAccountId = crypto.randomUUID();
  const dealId = crypto.randomUUID();
  const followUpId = crypto.randomUUID();
  const pendingReminderId = crypto.randomUUID();
  const snoozedReminderId = crypto.randomUUID();
  const pendingResolution = `pending-${suffix}`;
  const snoozedResolution = `snoozed-${suffix}`;
  const now = new Date();
  const future = new Date(now.getTime() + 86_400_000).toISOString();

  await insert<Array<{ id: string }>>("companies", {
    id: sourceId,
    name: `Merge source ${suffix}`,
    company: `Merged company ${suffix}`,
  });
  await insert<Array<{ id: string }>>("contacts", {
    id: contactId,
    company_id: sourceId,
    name: `Contact ${suffix}`,
    first_name: "Merge",
    last_name: `Contact ${suffix}`,
    email_jsonb: [{ email: `source-${suffix}@example.test`, type: "Work" }],
    phone_jsonb: [{ number: `+86${Date.now()}`, type: "Work" }],
  });
  await insert<Array<{ id: string }>>("contacts", {
    id: targetContactId,
    company_id: targetId,
    name: `Target Contact ${suffix}`,
    first_name: "Merge",
    last_name: `Contact ${suffix}`,
    email_jsonb: [{ email: `target-${suffix}@example.test`, type: "Work" }],
  });
  await insert<Array<{ id: string }>>("contact_notes", {
    id: contactNoteId,
    contact_id: contactId,
    text: `Contact note ${suffix}`,
  });
  await insert<Array<{ id: string }>>("tasks", {
    id: contactTaskId,
    contact_id: contactId,
    text: `Contact task ${suffix}`,
  });
  await insert<Array<{ id: string }>>("social_accounts", {
    id: socialAccountId,
    company_id: sourceId,
    contact_id: contactId,
    platform: "wechat",
    raw_identifier: `wx-${suffix}`,
    normalized_identifier: `wx-${suffix}`,
  });
  await insert<Array<{ id: string }>>("deals", {
    id: dealId,
    company_id: sourceId,
    name: `Deal ${suffix}`,
  });
  await insert<Array<{ contact_id: string }>>("deal_contacts", {
    deal_id: dealId,
    contact_id: contactId,
  });
  await insert<Array<{ id: string }>>("follow_ups", {
    id: followUpId,
    company_id: sourceId,
    deal_id: dealId,
    type: "note",
    note: `Follow-up ${suffix}`,
    occurred_at: now.toISOString(),
  });
  await insert<Array<{ id: string }>>("reminders", [
    {
      id: pendingReminderId,
      company_id: sourceId,
      deal_id: dealId,
      type: "fixed_time",
      status: "pending",
      due_at: future,
      priority: "high",
      resolution: pendingResolution,
    },
    {
      id: snoozedReminderId,
      company_id: sourceId,
      deal_id: dealId,
      type: "waiting_reply",
      status: "snoozed",
      due_at: future,
      snooze_until: future,
      priority: "normal",
      resolution: snoozedResolution,
    },
  ]);

  const searchResults = await expectJson<Array<{ id: string; name: string }>>(
    await asAlpha(
      `/rest/v1/companies_summary?select=id,name&deleted_at=is.null&search_text=ilike.*${searchToken}*`,
    ),
    200,
  );
  expect(searchResults).toEqual([{ id: targetId, name: targetName }]);

  const sourceDetail = await rpc<{ data: CustomerDetail }>(
    "get_customer_detail",
    { p_customer_id: sourceId },
  );
  expectCustomerAssociations(sourceDetail.data, {
    customerId: sourceId,
    contactId,
    socialAccountId,
    dealId,
    followUpId,
    reminderIds: [pendingReminderId, snoozedReminderId],
  });

  await page.goto(`/#/companies/${sourceId}/show`);
  await expect(
    page.getByRole("heading", {
      name: `Merge source ${suffix}`,
      exact: true,
    }),
  ).toBeVisible();
  for (const [regionName, expectedText] of [
    ["联系人", `Contact ${suffix}`],
    ["社媒账号", `wx-${suffix}`],
    ["项目", `Deal ${suffix}`],
    ["最近跟进", `Follow-up ${suffix}`],
  ] as const) {
    await expect(
      page
        .getByRole("region", { name: regionName, exact: true })
        .getByText(expectedText, { exact: false }),
    ).toBeVisible();
  }
  await expect(
    page.getByRole("region", { name: "未完成提醒", exact: true }),
  ).toContainText("2");

  const customerActions = page.getByRole("region", {
    name: "客户操作",
    exact: true,
  });
  await customerActions
    .getByRole("button", { name: "合并", exact: true })
    .click();
  const mergeDialog = page.getByRole("dialog", {
    name: `合并客户“Merge source ${suffix}”`,
    exact: true,
  });
  await mergeDialog.getByLabel("目标客户", { exact: true }).fill(targetName);
  const targetCandidate = mergeDialog
    .getByRole("radiogroup")
    .first()
    .locator("label")
    .filter({ hasText: targetName });
  await expect(targetCandidate).toHaveCount(1);
  await targetCandidate.getByRole("radio").click();
  await mergeDialog
    .getByRole("radio", { name: "公司名称 当前客户", exact: true })
    .click();
  await mergeDialog
    .getByRole("button", { name: "确认合并", exact: true })
    .click();
  await expect(page).toHaveURL(
    new RegExp(`#\/companies\/${targetId}\/show(?:\/.*)?$`),
  );
  await expect(
    page.getByRole("heading", { name: targetName, exact: true }),
  ).toBeVisible();

  const sourceRows = await expectJson<
    Array<{ id: string; deleted_at: string }>
  >(
    await asAlpha(`/rest/v1/companies?id=eq.${sourceId}&select=id,deleted_at`),
    200,
  );
  expect(sourceRows).toEqual([
    { id: sourceId, deleted_at: expect.any(String) as string },
  ]);

  for (const [resource, id] of [
    ["contacts", contactId],
    ["social_accounts", socialAccountId],
    ["deals", dealId],
    ["follow_ups", followUpId],
    ["reminders", pendingReminderId],
    ["reminders", snoozedReminderId],
  ] as const) {
    const rows = await expectJson<Array<{ id: string; company_id: string }>>(
      await asAlpha(`/rest/v1/${resource}?id=eq.${id}&select=id,company_id`),
      200,
    );
    expect(rows).toEqual([{ id, company_id: targetId }]);
  }

  const mergedDetail = await rpc<{ data: CustomerDetail }>(
    "get_customer_detail",
    { p_customer_id: targetId },
  );
  expectCustomerAssociations(mergedDetail.data, {
    customerId: targetId,
    contactId,
    socialAccountId,
    dealId,
    followUpId,
    reminderIds: [pendingReminderId, snoozedReminderId],
  });

  await page
    .getByRole("region", { name: "客户操作", exact: true })
    .getByRole("button", { name: "移至已删除客户", exact: true })
    .click();
  const deleteDialog = page.getByRole("dialog", {
    name: `删除客户“${targetName}”？`,
    exact: true,
  });
  await deleteDialog
    .getByRole("button", { name: "确认删除", exact: true })
    .click();
  await expect(page).toHaveURL(/#\/companies(?:\?.*)?$/);

  const remindersAfterDelete = await readReminderStates(
    asAlpha,
    pendingReminderId,
    snoozedReminderId,
  );
  expect(remindersAfterDelete).toHaveLength(2);
  expect(remindersAfterDelete).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        id: pendingReminderId,
        status: "ignored",
        resolution: "Customer deleted",
        deletion_event_id: expect.any(String),
      }),
      expect.objectContaining({
        id: snoozedReminderId,
        status: "ignored",
        resolution: "Customer deleted",
        deletion_event_id: expect.any(String),
      }),
    ]),
  );
  expect(remindersAfterDelete[0].deletion_event_id).toBe(
    remindersAfterDelete[1].deletion_event_id,
  );

  await page.goto("/#/companies/deleted");
  await expect(
    page.getByRole("heading", { name: "已删除客户", exact: true }),
  ).toBeVisible();
  const deletedRow = page.locator("tr").filter({ hasText: targetName });
  await expect(deletedRow).toHaveCount(1);
  await deletedRow.getByRole("button", { name: "恢复", exact: true }).click();
  await expect(deletedRow).toHaveCount(0);

  const remindersAfterRestore = await readReminderStates(
    asAlpha,
    pendingReminderId,
    snoozedReminderId,
  );
  expect(remindersAfterRestore).toHaveLength(2);
  expect(remindersAfterRestore).toEqual(
    expect.arrayContaining([
      {
        id: pendingReminderId,
        status: "pending",
        resolution: pendingResolution,
        deletion_event_id: null,
      },
      {
        id: snoozedReminderId,
        status: "snoozed",
        resolution: snoozedResolution,
        deletion_event_id: null,
      },
    ]),
  );

  const restoredDetail = await rpc<{ data: CustomerDetail }>(
    "get_customer_detail",
    { p_customer_id: targetId },
  );
  expectCustomerAssociations(restoredDetail.data, {
    customerId: targetId,
    contactId,
    socialAccountId,
    dealId,
    followUpId,
    reminderIds: [pendingReminderId, snoozedReminderId],
  });
  await page.goto(`/#/companies/${targetId}/show`);
  await expect(
    page.getByRole("heading", { name: targetName, exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "联系人", exact: true }),
  ).toContainText(`Contact ${suffix}`);
  await expect(
    page.getByRole("region", { name: "社媒账号", exact: true }),
  ).toContainText(`wx-${suffix}`);
  await expect(
    page.getByRole("region", { name: "项目", exact: true }),
  ).toContainText(`Deal ${suffix}`);

  await page.goto(`/#/contacts/${contactId}/show`);
  await page.getByRole("button", { name: "合并联系人", exact: true }).click();
  const contactMergeDialog = page.getByRole("dialog", {
    name: "合并联系人",
    exact: true,
  });
  const targetContactInput = contactMergeDialog.getByRole("combobox");
  await targetContactInput.fill(targetName);
  await page.getByRole("option").filter({ hasText: targetName }).click();
  await contactMergeDialog
    .getByRole("button", { name: "确认合并", exact: true })
    .click();
  await expect(page).toHaveURL(
    new RegExp(`#\/contacts\/${targetContactId}\/show(?:\/.*)?$`),
  );

  expect(
    await expectJson<unknown[]>(
      await asAlpha(`/rest/v1/contacts?id=eq.${contactId}&select=id`),
      200,
    ),
  ).toEqual([]);
  const mergedContacts = await expectJson<
    Array<{
      id: string;
      company_id: string;
      email_jsonb: Array<{ email: string }>;
      phone_jsonb: Array<{ number: string }>;
    }>
  >(
    await asAlpha(
      `/rest/v1/contacts?id=eq.${targetContactId}&select=id,company_id,email_jsonb,phone_jsonb`,
    ),
    200,
  );
  expect(mergedContacts).toEqual([
    expect.objectContaining({
      id: targetContactId,
      company_id: targetId,
      email_jsonb: expect.arrayContaining([
        expect.objectContaining({ email: `source-${suffix}@example.test` }),
        expect.objectContaining({ email: `target-${suffix}@example.test` }),
      ]),
      phone_jsonb: expect.arrayContaining([
        expect.objectContaining({ number: expect.stringMatching(/^\+86/) }),
      ]),
    }),
  ]);

  for (const [resource, id] of [
    ["contact_notes", contactNoteId],
    ["tasks", contactTaskId],
  ] as const) {
    expect(
      await expectJson<Array<{ id: string; contact_id: string }>>(
        await asAlpha(`/rest/v1/${resource}?id=eq.${id}&select=id,contact_id`),
        200,
      ),
    ).toEqual([{ id, contact_id: targetContactId }]);
  }
  expect(
    await expectJson<Array<{ deal_id: string; contact_id: string }>>(
      await asAlpha(
        `/rest/v1/deal_contacts?deal_id=eq.${dealId}&select=deal_id,contact_id`,
      ),
      200,
    ),
  ).toEqual([{ deal_id: dealId, contact_id: targetContactId }]);
  expect(
    await expectJson<
      Array<{ id: string; company_id: string; contact_id: string }>
    >(
      await asAlpha(
        `/rest/v1/social_accounts?id=eq.${socialAccountId}&select=id,company_id,contact_id`,
      ),
      200,
    ),
  ).toEqual([
    {
      id: socialAccountId,
      company_id: targetId,
      contact_id: targetContactId,
    },
  ]);
});

test("account deletion removes the authenticated user and all owned data", async () => {
  test.setTimeout(90_000);
  const environment = requireSupabaseAdminEnvironment();
  const userIds = requireSeededUserIds();
  const suffix = `${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 8)}`;
  const email = `dealpilot.delete.${suffix}@example.test`;
  const password = "DealPilot-E2E-Delete-2026!";
  const companyId = crypto.randomUUID();
  const contactId = crypto.randomUUID();
  const objectPath = `${suffix}/nested/account-delete.txt`;
  const requestId = `delete-account-${suffix}`;
  const adminHeaders = {
    apikey: environment.serviceRoleKey,
    authorization: `Bearer ${environment.serviceRoleKey}`,
    "content-type": "application/json",
  };
  const adminFetch = (path: string, init: RequestInit = {}) =>
    fetchSupabase(new URL(path, environment.url), {
      ...init,
      headers: { ...adminHeaders, ...init.headers },
    });

  let createdUserId: string | undefined;
  let uploadedObjectPath: string | undefined;
  try {
    const createUserResponse = await adminFetch("/auth/v1/admin/users", {
      method: "POST",
      body: JSON.stringify({
        email,
        password,
        email_confirm: true,
        user_metadata: { display_name: "Delete Account E2E" },
      }),
    });
    const createUserPayload = await expectJson<AdminUser | { user: AdminUser }>(
      createUserResponse,
      200,
    );
    const createdUser =
      "user" in createUserPayload ? createUserPayload.user : createUserPayload;
    createdUserId = createdUser.id;
    expect(createdUserId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );

    const session = await signIn(environment, email, password);
    expect(session.user.id).toBe(createdUserId);
    const userHeaders = {
      apikey: environment.anonKey,
      authorization: `Bearer ${session.access_token}`,
      "content-type": "application/json",
    };
    const asDeletingUser = (path: string, init: RequestInit = {}) =>
      fetchSupabase(new URL(path, environment.url), {
        ...init,
        headers: { ...userHeaders, ...init.headers },
      });

    const profilesBeforeDelete = await expectJson<Array<{ id: string }>>(
      await asDeletingUser(
        `/rest/v1/profiles?id=eq.${createdUserId}&select=id`,
      ),
      200,
    );
    expect(profilesBeforeDelete).toEqual([{ id: createdUserId }]);

    await expectJson<Array<{ id: string }>>(
      await asDeletingUser("/rest/v1/companies", {
        method: "POST",
        headers: { prefer: "return=representation" },
        body: JSON.stringify({
          id: companyId,
          name: `Delete account customer ${suffix}`,
        }),
      }),
      201,
    );
    await expectJson<Array<{ id: string }>>(
      await asDeletingUser("/rest/v1/contacts", {
        method: "POST",
        headers: { prefer: "return=representation" },
        body: JSON.stringify({
          id: contactId,
          company_id: companyId,
          name: `Delete account contact ${suffix}`,
        }),
      }),
      201,
    );

    uploadedObjectPath = `${createdUserId}/${objectPath}`;
    const uploadResponse = await asDeletingUser(
      `/storage/v1/object/attachments/${uploadedObjectPath}`,
      {
        method: "POST",
        headers: {
          "content-type": "text/plain",
          "x-upsert": "false",
        },
        body: "delete-account-e2e",
      },
    );
    expect(uploadResponse.status, await uploadResponse.text()).toBe(200);

    const objectsBeforeDelete = await listAttachmentObjects(
      adminFetch,
      createdUserId,
    );
    expect(objectsBeforeDelete).not.toEqual([]);

    const deleteResponse = await asDeletingUser(
      "/functions/v1/delete-account",
      {
        method: "POST",
        headers: { "x-request-id": requestId },
        body: JSON.stringify({ user_id: userIds.alpha }),
      },
    );
    expect(
      await expectJson<{ data: { deleted: boolean } }>(deleteResponse, 200),
    ).toEqual({ data: { deleted: true } });
    expect(deleteResponse.headers.get("x-request-id")).toBe(requestId);

    const deletedAuthUser = await adminFetch(
      `/auth/v1/admin/users/${createdUserId}`,
    );
    expect(deletedAuthUser.status).toBe(404);

    // The service role intentionally has no direct profile/contact table grants.
    // Schema tests verify those cascades; this E2E checks the customer root.
    const deletedCompanies = await expectJson<unknown[]>(
      await adminFetch(
        `/rest/v1/companies?owner_user_id=eq.${createdUserId}&select=id`,
      ),
      200,
    );
    expect(deletedCompanies).toEqual([]);

    expect(await listAttachmentObjects(adminFetch, createdUserId)).toEqual([]);

    const deletedUserLogin = await fetchSupabase(
      new URL("/auth/v1/token?grant_type=password", environment.url),
      {
        method: "POST",
        headers: {
          apikey: environment.anonKey,
          "content-type": "application/json",
        },
        body: JSON.stringify({ email, password }),
      },
    );
    expect(deletedUserLogin.status).toBe(400);

    const alphaSession = await signIn(
      environment,
      SUPABASE_E2E_USERS.alpha.email,
      SUPABASE_E2E_USERS.alpha.password,
    );
    expect(alphaSession.user.id).toBe(userIds.alpha);
    const alphaCustomers = await expectJson<Array<{ id: string }>>(
      await adminFetch(
        `/rest/v1/companies?id=eq.${SUPABASE_E2E_USERS.alpha.customerId}&owner_user_id=eq.${userIds.alpha}&select=id`,
      ),
      200,
    );
    expect(alphaCustomers).toEqual([
      { id: SUPABASE_E2E_USERS.alpha.customerId },
    ]);
  } finally {
    if (uploadedObjectPath) {
      await adminFetch(`/storage/v1/object/attachments/${uploadedObjectPath}`, {
        method: "DELETE",
      }).catch(() => undefined);
    }
    if (createdUserId) {
      await adminFetch(`/auth/v1/admin/users/${createdUserId}`, {
        method: "DELETE",
      }).catch(() => undefined);
    }
  }
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

const expectCustomerAssociations = (
  detail: CustomerDetail,
  expected: {
    customerId: string;
    contactId: string;
    socialAccountId: string;
    dealId: string;
    followUpId: string;
    reminderIds: string[];
  },
) => {
  expect(detail.id).toBe(expected.customerId);
  expect(detail.contacts).toContainEqual(
    expect.objectContaining({
      id: expected.contactId,
      company_id: expected.customerId,
    }),
  );
  expect(detail.social_accounts).toContainEqual(
    expect.objectContaining({
      id: expected.socialAccountId,
      company_id: expected.customerId,
    }),
  );
  expect(detail.deals).toContainEqual(
    expect.objectContaining({
      id: expected.dealId,
      company_id: expected.customerId,
    }),
  );
  expect(detail.recent_follow_ups).toContainEqual(
    expect.objectContaining({
      id: expected.followUpId,
      company_id: expected.customerId,
    }),
  );
  expect(detail.open_reminders.map(({ id }) => id)).toEqual(
    expect.arrayContaining(expected.reminderIds),
  );
};

const readReminderStates = async (
  request: (path: string, init?: RequestInit) => Promise<Response>,
  ...ids: string[]
) =>
  expectJson<
    Array<{
      id: string;
      status: string;
      resolution: string | null;
      deletion_event_id: string | null;
    }>
  >(
    await request(
      `/rest/v1/reminders?id=in.(${ids.join(",")})&select=id,status,resolution,deletion_event_id&order=id.asc`,
    ),
    200,
  );

const listAttachmentObjects = async (
  request: (path: string, init?: RequestInit) => Promise<Response>,
  userId: string,
) =>
  expectJson<Array<{ id: string | null; name: string }>>(
    await request("/storage/v1/object/list/attachments", {
      method: "POST",
      body: JSON.stringify({
        prefix: userId,
        limit: 100,
        offset: 0,
        sortBy: { column: "name", order: "asc" },
      }),
    }),
    200,
  );

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
