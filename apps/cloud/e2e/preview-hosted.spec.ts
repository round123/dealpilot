import {
  expect,
  test,
  type Browser,
  type BrowserContext,
  type Page,
  type Request,
  type Response as PlaywrightResponse,
} from "@playwright/test";
import { readFile } from "node:fs/promises";
import * as XLSX from "xlsx";

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

test("hosted Preview preserves account isolation and the Customer Web lifecycle", async ({
  browser,
}) => {
  test.setTimeout(180_000);
  const environment = requirePreviewEnvironment();
  const suffix = `preview-${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 8)}`;
  const alphaSession = await signIn(environment, environment.alpha);
  const betaSession = await signIn(environment, environment.beta);
  expect(alphaSession.user.id).not.toBe(betaSession.user.id);

  const asAlpha = authenticatedRequest(environment, alphaSession);
  const asBeta = authenticatedRequest(environment, betaSession);
  const sourceId = crypto.randomUUID();
  const betaCustomerId = crypto.randomUUID();
  const contactId = crypto.randomUUID();
  const socialAccountId = crypto.randomUUID();
  const dealId = crypto.randomUUID();
  const followUpId = crypto.randomUUID();
  const reminderId = crypto.randomUUID();
  const crossOwnerContactId = crypto.randomUUID();
  const forgedCustomerId = crypto.randomUUID();
  const createdTargetName = `Preview Created ${suffix}`;
  const targetName = `Preview Updated ${suffix}`;
  const sourceName = `Preview Merge ${suffix}`;
  const betaCustomerName = `Preview Beta ${suffix}`;
  const storagePath = `${alphaSession.user.id}/${suffix}/proof.txt`;
  const forbiddenStoragePath = `${betaSession.user.id}/${suffix}/forbidden.txt`;
  let ownStorageCreated = false;
  let forbiddenStorageCreated = false;
  let forgedCustomerCreated = false;
  let createdTargetId: string | undefined;
  const alphaContext = await browser.newContext();
  const alphaPage = await alphaContext.newPage();

  try {
    await insert(asBeta, "companies", {
      id: betaCustomerId,
      name: betaCustomerName,
    });

    await test.step("Web creates and updates a Customer", async () => {
      await login(alphaPage, environment.alpha);
      await alphaPage.goto("/#/companies/create");
      await alphaPage.locator('input[name="name"]').fill(createdTargetName);
      await alphaPage
        .getByRole("button", { name: /create customer|创建客户/i })
        .click();
      await expect(alphaPage).toHaveURL(/#\/companies\/[^/]+\/show/);

      const targetIdMatch = alphaPage
        .url()
        .match(/#\/companies\/([^/]+)\/show/);
      expect(targetIdMatch).not.toBeNull();
      createdTargetId = decodeURIComponent(targetIdMatch![1]);
      expect(createdTargetId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      );

      await alphaPage.goto(`/#/companies/${createdTargetId}`);
      const customerNameInput = alphaPage.locator('input[name="name"]');
      const customerCompanyInput = alphaPage.locator('input[name="company"]');
      await expect(customerNameInput).toHaveValue(createdTargetName);
      await customerNameInput.fill(targetName);
      await customerCompanyInput.fill(`Target ${suffix}`);
      await customerCompanyInput.blur();
      await expect(customerNameInput).toHaveValue(targetName);
      await expect(customerCompanyInput).toHaveValue(`Target ${suffix}`);
      const updateResponsePromise = waitForPostgrestResponse(
        alphaPage,
        "PATCH",
        "companies",
        createdTargetId,
      );
      await alphaPage.getByRole("button", { name: /保存/i }).click();
      const updateResponse = await updateResponsePromise;
      expect(
        updateResponse.ok(),
        `Customer update failed with HTTP ${updateResponse.status()}: ${await updateResponse.text()}`,
      ).toBe(true);
      await expect(alphaPage).toHaveURL(
        new RegExp(`#/companies/${createdTargetId}/show(?:/.*)?$`),
      );

      const persistedCustomers = await expectJson<
        Array<{ id: string; name: string; company: string }>
      >(
        await asAlpha(
          `/rest/v1/companies?id=eq.${createdTargetId}&select=id,name,company`,
        ),
        200,
      );
      expect(persistedCustomers).toEqual([
        {
          id: createdTargetId,
          name: targetName,
          company: `Target ${suffix}`,
        },
      ]);

      const refreshedCustomerResponse = waitForPostgrestResponse(
        alphaPage,
        "GET",
        "companies_summary",
        createdTargetId,
      );
      await alphaPage.reload();
      expect((await refreshedCustomerResponse).ok()).toBe(true);
      await expect(
        alphaPage.getByRole("heading", { name: targetName, exact: true }),
      ).toBeVisible();
    });

    const targetId = createdTargetId;
    if (!targetId)
      throw new Error("Web Customer creation did not return an ID");

    await insert(asAlpha, "companies", {
      id: sourceId,
      name: sourceName,
      company: `Source ${suffix}`,
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

      const crossOwnerDetail = await asAlpha(
        "/rest/v1/rpc/get_customer_detail",
        {
          method: "POST",
          body: JSON.stringify({ p_customer_id: betaCustomerId }),
        },
      );
      expect(crossOwnerDetail.ok).toBe(false);
      expect(await crossOwnerDetail.json()).toMatchObject({ code: "P0002" });

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

    await test.step("Web Customer detail renders every required association", async () => {
      const detailResponse = waitForRpcResponse(
        alphaPage,
        "get_customer_detail",
      );
      await alphaPage.goto(`/#/companies/${sourceId}/show`);
      expect((await detailResponse).ok()).toBe(true);
      await expect(
        alphaPage.getByRole("heading", { name: sourceName, exact: true }),
      ).toBeVisible();
      for (const [regionName, expectedText] of [
        ["联系人", `Contact ${suffix}`],
        ["社媒账号", `wx-${suffix}`],
        ["项目", `Deal ${suffix}`],
        ["最近跟进", `Follow-up ${suffix}`],
      ] as const) {
        await expect(
          alphaPage
            .getByRole("region", { name: regionName, exact: true })
            .getByText(expectedText, { exact: false }),
        ).toBeVisible();
      }
      await expect(
        alphaPage.getByRole("region", { name: "未完成提醒", exact: true }),
      ).toContainText("1");
    });

    await test.step("Web merges the source Customer into the selected target", async () => {
      const customerActions = alphaPage.getByRole("region", {
        name: "客户操作",
        exact: true,
      });
      await customerActions
        .getByRole("button", { name: "合并", exact: true })
        .click();
      const mergeDialog = alphaPage.getByRole("dialog", {
        name: `合并客户“${sourceName}”`,
        exact: true,
      });
      await mergeDialog
        .getByLabel("目标客户", { exact: true })
        .fill(targetName);
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
      const mergeResponse = waitForRpcResponse(alphaPage, "merge_customers");
      await mergeDialog
        .getByRole("button", { name: "确认合并", exact: true })
        .click();
      expect((await mergeResponse).ok()).toBe(true);

      await expect(alphaPage).toHaveURL(
        new RegExp(`#/companies/${targetId}/show(?:/.*)?$`),
      );
      await expect(
        alphaPage.getByRole("heading", { name: targetName, exact: true }),
      ).toBeVisible();

      const sourceRows = await expectJson<
        Array<{ id: string; deleted_at: string }>
      >(
        await asAlpha(
          `/rest/v1/companies?id=eq.${sourceId}&select=id,deleted_at`,
        ),
        200,
      );
      expect(sourceRows).toHaveLength(1);
      expect(sourceRows[0]).toEqual({
        id: sourceId,
        deleted_at: expect.any(String),
      });
      for (const [resource, id] of [
        ["contacts", contactId],
        ["social_accounts", socialAccountId],
        ["deals", dealId],
        ["follow_ups", followUpId],
        ["reminders", reminderId],
      ] as const) {
        const rows = await expectJson<
          Array<{ id: string; company_id: string }>
        >(
          await asAlpha(
            `/rest/v1/${resource}?id=eq.${id}&select=id,company_id`,
          ),
          200,
        );
        expect(rows).toEqual([{ id, company_id: targetId }]);
      }

      for (const [regionName, expectedText] of [
        ["联系人", `Contact ${suffix}`],
        ["社媒账号", `wx-${suffix}`],
        ["项目", `Deal ${suffix}`],
        ["最近跟进", `Follow-up ${suffix}`],
      ] as const) {
        await expect(
          alphaPage
            .getByRole("region", { name: regionName, exact: true })
            .getByText(expectedText, { exact: false }),
        ).toBeVisible();
      }
    });

    await test.step("Web soft deletes and restores the merged Customer", async () => {
      await alphaPage
        .getByRole("region", { name: "客户操作", exact: true })
        .getByRole("button", { name: "移至已删除客户", exact: true })
        .click();
      const deleteDialog = alphaPage.getByRole("dialog", {
        name: `删除客户“${targetName}”？`,
        exact: true,
      });
      const deleteResponse = waitForRpcResponse(
        alphaPage,
        "soft_delete_customer",
      );
      await deleteDialog
        .getByRole("button", { name: "确认删除", exact: true })
        .click();
      expect((await deleteResponse).ok()).toBe(true);
      await expect(alphaPage).toHaveURL(/#\/companies(?:\?.*)?$/);
      expect(await readReminder(asAlpha, reminderId)).toEqual({
        id: reminderId,
        status: "ignored",
        resolution: "Customer deleted",
        deletion_event_id: expect.any(String),
      });

      await alphaPage.goto("/#/companies/deleted");
      await expect(
        alphaPage.getByRole("heading", { name: "已删除客户", exact: true }),
      ).toBeVisible();
      const deletedRow = alphaPage
        .getByRole("listitem")
        .filter({ hasText: targetName });
      await expect(deletedRow).toHaveCount(1);
      const restoreResponse = waitForRpcResponse(alphaPage, "restore_customer");
      await deletedRow
        .getByRole("button", { name: "恢复", exact: true })
        .click();
      expect((await restoreResponse).ok()).toBe(true);
      await expect(deletedRow).toHaveCount(0);
      expect(await readReminder(asAlpha, reminderId)).toEqual({
        id: reminderId,
        status: "pending",
        resolution: originalResolution,
        deletion_event_id: null,
      });

      await alphaPage.goto(`/#/companies/${targetId}/show`);
      await expect(
        alphaPage.getByRole("heading", { name: targetName, exact: true }),
      ).toBeVisible();
      await expect(
        alphaPage.getByRole("region", { name: "联系人", exact: true }),
      ).toContainText(`Contact ${suffix}`);
      await expect(
        alphaPage.getByRole("region", { name: "社媒账号", exact: true }),
      ).toContainText(`wx-${suffix}`);
      await expect(
        alphaPage.getByRole("region", { name: "项目", exact: true }),
      ).toContainText(`Deal ${suffix}`);
      await expect(
        alphaPage.getByRole("region", { name: "最近跟进", exact: true }),
      ).toContainText(`Follow-up ${suffix}`);
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
    await alphaContext.close();
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
      asAlpha(
        `/rest/v1/companies?id=in.(${createdTargetId ? `${createdTargetId},` : ""}${sourceId})`,
        { method: "DELETE" },
      ),
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

test("hosted Preview imports CSV persistently and exports isolated XLSX data", async ({
  browser,
}) => {
  test.setTimeout(180_000);
  const environment = requirePreviewEnvironment();
  const suffix = `preview-data-${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 8)}`;
  const alphaSession = await signIn(environment, environment.alpha);
  const betaSession = await signIn(environment, environment.beta);
  const asAlpha = authenticatedRequest(environment, alphaSession);
  const asBeta = authenticatedRequest(environment, betaSession);
  const importedCustomerName = `CSV Customer ${suffix}`;
  const importedCompany = `CSV Company ${suffix}`;
  const importedContactName = `CSV Contact ${suffix}`;
  const importedEmail = `${suffix}@example.com`;
  const betaCustomerId = crypto.randomUUID();
  const betaCustomerName = `Export must exclude ${suffix}`;
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();
  let importedCustomerId: string | undefined;

  try {
    await insert(asBeta, "companies", {
      id: betaCustomerId,
      name: betaCustomerName,
    });
    await login(page, environment.alpha);

    await test.step("Web imports a real CSV fixture and persists it after refresh", async () => {
      const csv = [
        "客户名称,公司,联系人,邮箱",
        [
          importedCustomerName,
          importedCompany,
          importedContactName,
          importedEmail,
        ].join(","),
      ].join("\r\n");

      await page.goto("/#/import");
      await page.locator('input[type="file"]').setInputFiles({
        name: `customers-${suffix}.csv`,
        mimeType: "text/csv",
        buffer: Buffer.from(csv, "utf8"),
      });
      await expect(page.getByText(`customers-${suffix}.csv`)).toBeVisible();
      await page.getByRole("button", { name: "解析并继续" }).click();

      await expect(
        page.getByRole("heading", { name: "字段映射", exact: true }),
      ).toBeVisible();
      for (const [fieldLabel, sourceColumn] of [
        ["客户名称", "客户名称"],
        ["公司", "公司"],
        ["联系人", "联系人"],
        ["邮箱", "邮箱"],
      ] as const) {
        await selectImportSource(page, fieldLabel, sourceColumn);
      }
      await page.getByRole("button", { name: "下一步" }).click();

      await expect(
        page.getByText(importedCustomerName, { exact: true }),
      ).toBeVisible();
      await expect(
        page.getByText(importedContactName, { exact: true }),
      ).toBeVisible();
      const commitResponsePromise = waitForRpcResponse(
        page,
        "commit_customer_import",
      );
      await page.getByRole("button", { name: "确认导入" }).click();
      const commitResponse = await commitResponsePromise;
      expect(
        commitResponse.ok(),
        `CSV import failed with HTTP ${commitResponse.status()}: ${await commitResponse.text()}`,
      ).toBe(true);
      await expect(
        page.getByRole("heading", { name: "导入完成", exact: true }),
      ).toBeVisible();

      const importedCustomers = await expectJson<
        Array<{ id: string; name: string; company: string }>
      >(
        await asAlpha(
          `/rest/v1/companies?name=eq.${encodeURIComponent(importedCustomerName)}&select=id,name,company`,
        ),
        200,
      );
      expect(importedCustomers).toEqual([
        {
          id: expect.any(String),
          name: importedCustomerName,
          company: importedCompany,
        },
      ]);
      importedCustomerId = importedCustomers[0]!.id;

      const importedContacts = await expectJson<
        Array<{
          company_id: string;
          name: string;
          email_jsonb: Array<{ email: string; type: string }>;
        }>
      >(
        await asAlpha(
          `/rest/v1/contacts?company_id=eq.${importedCustomerId}&select=company_id,name,email_jsonb`,
        ),
        200,
      );
      expect(importedContacts).toEqual([
        {
          company_id: importedCustomerId,
          name: importedContactName,
          email_jsonb: [{ email: importedEmail, type: "Work" }],
        },
      ]);

      await page.goto("/#/companies");
      await page.reload();
      const search = page.getByPlaceholder(/search|搜索/i).first();
      await expect(search).toBeVisible();
      await search.fill(importedCustomerName);
      await expect(
        page.getByText(importedCustomerName, { exact: true }).first(),
      ).toBeVisible();
    });

    await test.step("Web exports an XLSX containing only the signed-in account data", async () => {
      const diagnostics = observeExportDiagnostics(page);
      await page.goto("/#/settings/cloud-data");
      await expect(
        page.getByRole("heading", { name: "导出与数据管理", exact: true }),
      ).toBeVisible();

      try {
        const exportButton = page.getByRole("button", { name: "导出 Excel" });
        await expect(exportButton).toBeEnabled();
        const downloadPromise = page
          .waitForEvent("download", { timeout: 45_000 })
          .then((download) => ({ kind: "download" as const, download }));
        const exportErrorPromise = page
          .getByText(
            /云端数据导出超时，请检查网络后重试|云端数据导出失败，请重试|数据超过 10000 条/,
          )
          .waitFor({ state: "visible", timeout: 45_000 })
          .then(() => ({ kind: "error" as const }));
        await exportButton.click();
        const outcome = await Promise.race([
          downloadPromise,
          exportErrorPromise,
        ]).catch(async (error) => {
          throw new Error(
            `XLSX export did not start within 45 seconds. ${await diagnostics.summary()}`,
            { cause: error },
          );
        });
        if (outcome.kind === "error") {
          throw new Error(
            `XLSX export reported an application error. ${await diagnostics.summary()}`,
          );
        }
        const { download } = outcome;
        expect(download.suggestedFilename()).toMatch(
          /^dealpilot-cloud-export-.*\.xlsx$/,
        );
        const downloadPath = await download.path();
        expect(downloadPath).not.toBeNull();
        const workbook = XLSX.read(await readFile(downloadPath!), {
          type: "buffer",
        });
        expect(workbook.SheetNames).toEqual([
          "客户",
          "联系人",
          "社媒账号",
          "项目",
          "跟进",
          "提醒",
          "项目风险",
          "项目里程碑",
          "导出说明",
        ]);

        const customerRows = sheetRows(workbook, "客户");
        expect(customerRows).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              name: importedCustomerName,
              company: importedCompany,
            }),
          ]),
        );
        expect(customerRows.some((row) => row.name === betaCustomerName)).toBe(
          false,
        );

        const contactRows = sheetRows(workbook, "联系人");
        const exportedContact = contactRows.find(
          (row) => row.name === importedContactName,
        );
        expect(exportedContact).toBeDefined();
        expect(String(exportedContact!.email_jsonb)).toContain(importedEmail);

        expect(sheetRows(workbook, "导出说明")).toEqual(
          expect.arrayContaining([
            { 字段: "数据来源", 值: "DealPilot Cloud / Supabase" },
            { 字段: "说明", 值: "仅包含当前账号在 RLS 授权范围内的数据" },
          ]),
        );
      } finally {
        diagnostics.dispose();
      }
    });
  } finally {
    await closeContext(context);
    const cleanupResponses = await Promise.all([
      asAlpha(
        `/rest/v1/companies?name=eq.${encodeURIComponent(importedCustomerName)}`,
        { method: "DELETE" },
      ),
      asBeta(`/rest/v1/companies?id=eq.${betaCustomerId}`, {
        method: "DELETE",
      }),
    ]);
    for (const response of cleanupResponses) {
      expect(
        response.ok,
        `Preview data-tools cleanup failed with HTTP ${response.status}: ${await response.text()}`,
      ).toBe(true);
    }
  }
});

test("hosted Preview accepts the complete P0 business workflow", async ({
  browser,
}) => {
  test.setTimeout(300_000);
  const environment = requirePreviewEnvironment();
  const suffix = `preview-p0-${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 8)}`;
  const alphaSession = await signIn(environment, environment.alpha);
  const betaSession = await signIn(environment, environment.beta);
  expect(alphaSession.user.id).not.toBe(betaSession.user.id);

  const asAlpha = authenticatedRequest(environment, alphaSession);
  const asBeta = authenticatedRequest(environment, betaSession);
  const alphaIds = {
    company: crypto.randomUUID(),
    contact: crypto.randomUUID(),
    socialAccount: crypto.randomUUID(),
    deal: crypto.randomUUID(),
    risk: crypto.randomUUID(),
    milestone: crypto.randomUUID(),
    followUp: crypto.randomUUID(),
    reminder: crypto.randomUUID(),
  };
  const betaIds = {
    company: crypto.randomUUID(),
    contact: crypto.randomUUID(),
    socialAccount: crypto.randomUUID(),
    deal: crypto.randomUUID(),
    risk: crypto.randomUUID(),
    milestone: crypto.randomUUID(),
    followUp: crypto.randomUUID(),
    reminder: crypto.randomUUID(),
  };
  const alphaNames = {
    company: `Alpha P0 Customer ${suffix}`,
    contact: `Alpha P0 Contact ${suffix}`,
    socialAccount: `alpha-wx-${suffix}`,
    deal: `Alpha P0 Deal ${suffix}`,
    risk: `Alpha critical risk ${suffix}`,
    milestone: `Alpha milestone ${suffix}`,
    followUp: `Alpha follow-up ${suffix}`,
    webContact: `Alpha Web Contact ${suffix}`,
    webContactUpdated: `Alpha Web Contact Updated ${suffix}`,
    webSocialAccount: `@alpha-web-${suffix}`,
    webRisk: `Alpha Web risk ${suffix}`,
    webMilestone: `Alpha Web milestone ${suffix}`,
    webFollowUp: `Alpha Web follow-up ${suffix}`,
  };
  const betaNames = {
    company: `Beta P0 Customer ${suffix}`,
    contact: `Beta P0 Contact ${suffix}`,
    socialAccount: `beta-wx-${suffix}`,
    deal: `Beta P0 Deal ${suffix}`,
    risk: `Beta critical risk ${suffix}`,
    milestone: `Beta milestone ${suffix}`,
    followUp: `Beta follow-up ${suffix}`,
  };
  const expectedClosingDate = new Date(Date.now() + 30 * 86_400_000)
    .toISOString()
    .slice(0, 10);
  const milestoneDueDate = new Date(Date.now() + 14 * 86_400_000)
    .toISOString()
    .slice(0, 10);
  const context = await browser.newContext();
  const page = await context.newPage();
  const extraCleanupTargets: Array<readonly [string, string]> = [];
  const reminderCommandIds = {
    later: crypto.randomUUID(),
    ignore: crypto.randomUUID(),
    dashboard: crypto.randomUUID(),
  };
  let webContactId: string | undefined;
  let webRiskId: string | undefined;
  let webMilestoneId: string | undefined;
  let webFollowUpId: string | undefined;
  let webReplyReminderId: string | undefined;

  try {
    await Promise.all([
      insert(asAlpha, "companies", {
        id: alphaIds.company,
        name: alphaNames.company,
        company: `Alpha Trading ${suffix}`,
        grade: "A",
      }),
      insert(asBeta, "companies", {
        id: betaIds.company,
        name: betaNames.company,
        company: `Beta Trading ${suffix}`,
        grade: "A",
      }),
    ]);
    await Promise.all([
      insert(asAlpha, "contacts", {
        id: alphaIds.contact,
        company_id: alphaIds.company,
        first_name: alphaNames.contact,
        last_name: "User",
        name: `${alphaNames.contact} User`,
        last_seen: new Date().toISOString(),
      }),
      insert(asBeta, "contacts", {
        id: betaIds.contact,
        company_id: betaIds.company,
        first_name: betaNames.contact,
        last_name: "User",
        name: `${betaNames.contact} User`,
        last_seen: new Date().toISOString(),
      }),
      insert(asAlpha, "deals", {
        id: alphaIds.deal,
        company_id: alphaIds.company,
        name: alphaNames.deal,
        description: `Alpha business description ${suffix}`,
        stage: "proposal",
        grade: "A",
        currency: "CNY",
        amount: 125000,
        probability: 65,
        expected_closing_date: expectedClosingDate,
        closed_reason: null,
      }),
      insert(asBeta, "deals", {
        id: betaIds.deal,
        company_id: betaIds.company,
        name: betaNames.deal,
        description: `Beta business description ${suffix}`,
        stage: "proposal",
        grade: "A",
        currency: "CNY",
        amount: 98000,
        probability: 55,
        expected_closing_date: expectedClosingDate,
        closed_reason: null,
      }),
    ]);
    await Promise.all([
      insert(asAlpha, "social_accounts", {
        id: alphaIds.socialAccount,
        company_id: alphaIds.company,
        contact_id: alphaIds.contact,
        platform: "wechat",
        raw_identifier: alphaNames.socialAccount,
        normalized_identifier: alphaNames.socialAccount,
      }),
      insert(asBeta, "social_accounts", {
        id: betaIds.socialAccount,
        company_id: betaIds.company,
        contact_id: betaIds.contact,
        platform: "wechat",
        raw_identifier: betaNames.socialAccount,
        normalized_identifier: betaNames.socialAccount,
      }),
      insert(asAlpha, "deal_contacts", {
        deal_id: alphaIds.deal,
        contact_id: alphaIds.contact,
      }),
      insert(asBeta, "deal_contacts", {
        deal_id: betaIds.deal,
        contact_id: betaIds.contact,
      }),
      insert(asAlpha, "deal_risks", {
        id: alphaIds.risk,
        deal_id: alphaIds.deal,
        description: alphaNames.risk,
        severity: "critical",
        status: "open",
      }),
      insert(asBeta, "deal_risks", {
        id: betaIds.risk,
        deal_id: betaIds.deal,
        description: betaNames.risk,
        severity: "critical",
        status: "open",
      }),
      insert(asAlpha, "deal_milestones", {
        id: alphaIds.milestone,
        deal_id: alphaIds.deal,
        name: alphaNames.milestone,
        due_date: milestoneDueDate,
        completed: false,
      }),
      insert(asBeta, "deal_milestones", {
        id: betaIds.milestone,
        deal_id: betaIds.deal,
        name: betaNames.milestone,
        due_date: milestoneDueDate,
        completed: false,
      }),
      insert(asAlpha, "follow_ups", {
        id: alphaIds.followUp,
        company_id: alphaIds.company,
        deal_id: alphaIds.deal,
        type: "note",
        note: alphaNames.followUp,
        occurred_at: new Date().toISOString(),
      }),
      insert(asBeta, "follow_ups", {
        id: betaIds.followUp,
        company_id: betaIds.company,
        deal_id: betaIds.deal,
        type: "note",
        note: betaNames.followUp,
        occurred_at: new Date().toISOString(),
      }),
      insert(asAlpha, "reminders", {
        id: alphaIds.reminder,
        company_id: alphaIds.company,
        deal_id: alphaIds.deal,
        type: "waiting_reply",
        status: "pending",
        due_at: "2000-01-01T00:00:00.000Z",
        priority: "urgent",
      }),
      insert(asBeta, "reminders", {
        id: betaIds.reminder,
        company_id: betaIds.company,
        deal_id: betaIds.deal,
        type: "waiting_reply",
        status: "pending",
        due_at: "2000-01-02T00:00:00.000Z",
        priority: "urgent",
      }),
    ]);

    await test.step("RLS hides every Beta P0 record from the Alpha account", async () => {
      for (const [resource, filter] of [
        ["companies", `id=eq.${betaIds.company}`],
        ["contacts", `id=eq.${betaIds.contact}`],
        ["social_accounts", `id=eq.${betaIds.socialAccount}`],
        ["deals", `id=eq.${betaIds.deal}`],
        [
          "deal_contacts",
          `deal_id=eq.${betaIds.deal}&contact_id=eq.${betaIds.contact}`,
        ],
        ["deal_risks", `id=eq.${betaIds.risk}`],
        ["deal_milestones", `id=eq.${betaIds.milestone}`],
        ["follow_ups", `id=eq.${betaIds.followUp}`],
        ["reminders", `id=eq.${betaIds.reminder}`],
      ] as const) {
        expect(
          await expectJson<unknown[]>(
            await asAlpha(`/rest/v1/${resource}?${filter}&select=*`),
            200,
          ),
          `Alpha must not read Beta ${resource}`,
        ).toEqual([]);
      }
    });

    await login(page, environment.alpha);

    await test.step("Web creates and edits a Contact without exposing it to Beta", async () => {
      await page.goto("/#/contacts/create");
      await page
        .locator('input[name="first_name"]')
        .fill(alphaNames.webContact);
      await page.locator('input[name="last_name"]').fill("User");
      await selectHostedAutocomplete(page, "所属客户", alphaNames.company);
      await page.getByRole("button", { name: "保存", exact: true }).click();
      await expect(page).toHaveURL(/#\/contacts\/[^/]+\/show(?:\/.*)?$/);

      const contactIdMatch = page.url().match(/#\/contacts\/([^/]+)\/show/);
      expect(
        contactIdMatch,
        `Unable to read Contact ID from ${page.url()}`,
      ).not.toBeNull();
      webContactId = decodeURIComponent(contactIdMatch![1]);
      extraCleanupTargets.push(["contacts", `id=eq.${webContactId}`]);

      await page.goto(`/#/contacts/${webContactId}`);
      await expect(page.locator('input[name="first_name"]')).toHaveValue(
        alphaNames.webContact,
      );
      await page
        .locator('input[name="first_name"]')
        .fill(alphaNames.webContactUpdated);
      const contactUpdateResponse = waitForPostgrestResponse(
        page,
        "PATCH",
        "contacts",
        webContactId,
      );
      await page.getByRole("button", { name: "保存", exact: true }).click();
      expect((await contactUpdateResponse).ok()).toBe(true);
      await expect(page).toHaveURL(
        new RegExp(`#/contacts/${webContactId}/show(?:/.*)?$`),
      );

      const persisted = await expectJson<
        Array<{
          id: string;
          first_name: string;
          last_name: string;
          company_id: string;
        }>
      >(
        await asAlpha(
          `/rest/v1/contacts?id=eq.${webContactId}&select=id,first_name,last_name,company_id`,
        ),
        200,
      );
      expect(persisted).toEqual([
        {
          id: webContactId,
          first_name: alphaNames.webContactUpdated,
          last_name: "User",
          company_id: alphaIds.company,
        },
      ]);
      expect(
        await expectJson<unknown[]>(
          await asBeta(`/rest/v1/contacts?id=eq.${webContactId}&select=id`),
          200,
        ),
      ).toEqual([]);
    });

    await test.step("Web adds and removes a Customer social account", async () => {
      await page.goto(`/#/companies/${alphaIds.company}/show`);
      const socialAccounts = page.getByRole("region", {
        name: "社媒账号",
        exact: true,
      });
      await socialAccounts
        .getByRole("button", { name: "添加账号", exact: true })
        .click();
      await socialAccounts
        .getByLabel("平台", { exact: true })
        .selectOption("telegram");
      await socialAccounts
        .getByLabel("账号标识", { exact: true })
        .fill(alphaNames.webSocialAccount);
      await socialAccounts
        .getByRole("button", { name: "保存账号", exact: true })
        .click();
      await expect(
        socialAccounts.getByText(alphaNames.webSocialAccount, { exact: true }),
      ).toBeVisible();

      const createdAccounts = await expectJson<Array<{ id: string }>>(
        await asAlpha(
          `/rest/v1/social_accounts?company_id=eq.${alphaIds.company}&raw_identifier=eq.${encodeURIComponent(alphaNames.webSocialAccount)}&select=id`,
        ),
        200,
      );
      expect(createdAccounts).toHaveLength(1);
      expect(
        await expectJson<unknown[]>(
          await asBeta(
            `/rest/v1/social_accounts?id=eq.${createdAccounts[0].id}&select=id`,
          ),
          200,
        ),
      ).toEqual([]);

      await socialAccounts
        .getByRole("button", {
          name: `删除账号 ${alphaNames.webSocialAccount}`,
          exact: true,
        })
        .click();
      await expect(
        socialAccounts.getByText(alphaNames.webSocialAccount, { exact: true }),
      ).toHaveCount(0);
      expect(
        await expectJson<unknown[]>(
          await asAlpha(
            `/rest/v1/social_accounts?id=eq.${createdAccounts[0].id}&select=id`,
          ),
          200,
        ),
      ).toEqual([]);
    });

    await test.step("Web updates every required Deal commercial field", async () => {
      await page.goto(`/#/deals/${alphaIds.deal}`);
      const dealDialog = page.getByRole("dialog");
      await expect(dealDialog).toBeVisible();
      await dealDialog
        .getByRole("spinbutton", { name: "项目金额", exact: true })
        .fill("175000");
      await dealDialog
        .getByRole("textbox", { name: "币种", exact: true })
        .fill("USD");
      await dealDialog
        .getByRole("spinbutton", { name: "成交概率（%）", exact: true })
        .fill("80");
      await selectHostedChoice(page, "项目评级", "B");
      await selectHostedChoice(page, "项目阶段", "未成交");
      const closedReason = `Hosted close reason ${suffix}`;
      await dealDialog
        .getByRole("textbox", { name: "失单或关闭原因", exact: true })
        .fill(closedReason);
      const updateResponse = waitForPostgrestResponse(
        page,
        "PATCH",
        "deals",
        alphaIds.deal,
      );
      await dealDialog
        .getByRole("button", { name: "保存", exact: true })
        .click();
      expect((await updateResponse).ok()).toBe(true);
      await expect(page).toHaveURL(
        new RegExp(`#/deals/${alphaIds.deal}/show(?:/.*)?$`),
      );

      expect(
        await expectJson(
          await asAlpha(
            `/rest/v1/deals?id=eq.${alphaIds.deal}&select=stage,amount,currency,probability,grade,closed_reason`,
          ),
          200,
        ),
      ).toEqual([
        {
          stage: "closed_lost",
          amount: 175000,
          currency: "USD",
          probability: 80,
          grade: "B",
          closed_reason: closedReason,
        },
      ]);
    });

    await test.step("Contacts and Customer social details render without cross-account leakage", async () => {
      await page.goto("/#/contacts");
      await expect(
        page.getByText(alphaNames.contact, { exact: false }).first(),
      ).toBeVisible();
      await expect(
        page.getByText(betaNames.contact, { exact: false }),
      ).toHaveCount(0);

      await page.goto(`/#/companies/${alphaIds.company}/show`);
      await expect(
        page
          .getByRole("region", { name: "联系人", exact: true })
          .getByText(alphaNames.contact, { exact: false }),
      ).toBeVisible();
      await expect(
        page
          .getByRole("region", { name: "社媒账号", exact: true })
          .getByText(alphaNames.socialAccount, { exact: false }),
      ).toBeVisible();
      await expect(
        page.getByText(betaNames.company, { exact: false }),
      ).toHaveCount(0);
    });

    await test.step("Deal detail renders commercial fields, risk, milestone, and linked contact", async () => {
      await page.goto(`/#/deals/${alphaIds.deal}/show`);
      const dealDialog = page.getByRole("dialog").filter({
        has: page.getByRole("heading", {
          name: alphaNames.deal,
          exact: true,
        }),
      });
      await expect(dealDialog).toBeVisible();
      await expect(
        dealDialog.getByText("项目评级", { exact: true }).locator(".."),
      ).toContainText("B");
      await expect(
        dealDialog.getByText("成交概率（%）", { exact: true }).locator(".."),
      ).toContainText("80%");
      await expect(
        dealDialog.getByText(alphaNames.contact, { exact: false }),
      ).toBeVisible();
      await expect(
        dealDialog
          .getByRole("region", { name: "项目风险", exact: true })
          .getByText(alphaNames.risk, { exact: true }),
      ).toBeVisible();
      await expect(
        dealDialog
          .getByRole("region", { name: "项目里程碑", exact: true })
          .getByText(alphaNames.milestone, { exact: true }),
      ).toBeVisible();
      await expect(
        dealDialog.getByText(betaNames.risk, { exact: false }),
      ).toHaveCount(0);
    });

    await test.step("Web creates a risk and milestone and persists their status", async () => {
      await page.goto(`/#/deals/${alphaIds.deal}/show`);
      const dealDialog = page.getByRole("dialog").filter({
        has: page.getByRole("heading", {
          name: alphaNames.deal,
          exact: true,
        }),
      });
      await expect(dealDialog).toBeVisible();

      const risks = dealDialog.getByRole("region", {
        name: "项目风险",
        exact: true,
      });
      await risks
        .getByRole("button", { name: "添加风险", exact: true })
        .click();
      await risks
        .getByRole("textbox", { name: "风险描述", exact: true })
        .fill(alphaNames.webRisk);
      await risks
        .getByRole("combobox", { name: "严重程度", exact: true })
        .selectOption("high");
      await risks
        .getByRole("button", { name: "保存风险", exact: true })
        .click();
      await expect(
        risks.getByText(alphaNames.webRisk, { exact: true }),
      ).toBeVisible();
      const webRiskRows = await expectJson<Array<{ id: string }>>(
        await asAlpha(
          `/rest/v1/deal_risks?deal_id=eq.${alphaIds.deal}&description=eq.${encodeURIComponent(alphaNames.webRisk)}&select=id`,
        ),
        200,
      );
      expect(webRiskRows).toHaveLength(1);
      webRiskId = webRiskRows[0].id;
      extraCleanupTargets.push(["deal_risks", `id=eq.${webRiskId}`]);
      const webRiskItem = risks
        .getByRole("listitem")
        .filter({ hasText: alphaNames.webRisk });
      const riskStatusResponse = waitForPostgrestResponse(
        page,
        "PATCH",
        "deal_risks",
        webRiskId,
      );
      await webRiskItem
        .getByRole("combobox", { name: "更新风险状态", exact: true })
        .selectOption("resolved");
      expect((await riskStatusResponse).ok()).toBe(true);
      await expect(
        webRiskItem.getByRole("combobox", {
          name: "更新风险状态",
          exact: true,
        }),
      ).toHaveValue("resolved");

      const milestones = dealDialog.getByRole("region", {
        name: "项目里程碑",
        exact: true,
      });
      await milestones
        .getByRole("button", { name: "添加里程碑", exact: true })
        .click();
      await milestones
        .getByRole("textbox", { name: "里程碑名称", exact: true })
        .fill(alphaNames.webMilestone);
      await milestones
        .getByRole("button", { name: "保存里程碑", exact: true })
        .click();
      await expect(
        milestones.getByText(alphaNames.webMilestone, { exact: true }),
      ).toBeVisible();
      const webMilestoneRows = await expectJson<Array<{ id: string }>>(
        await asAlpha(
          `/rest/v1/deal_milestones?deal_id=eq.${alphaIds.deal}&name=eq.${encodeURIComponent(alphaNames.webMilestone)}&select=id`,
        ),
        200,
      );
      expect(webMilestoneRows).toHaveLength(1);
      webMilestoneId = webMilestoneRows[0].id;
      extraCleanupTargets.push(["deal_milestones", `id=eq.${webMilestoneId}`]);
      const webMilestoneItem = milestones
        .getByRole("listitem")
        .filter({ hasText: alphaNames.webMilestone });
      const completed = webMilestoneItem.getByRole("checkbox", {
        name: "切换里程碑完成状态",
        exact: true,
      });
      const milestoneStatusResponse = waitForPostgrestResponse(
        page,
        "PATCH",
        "deal_milestones",
        webMilestoneId,
      );
      await completed.click();
      expect((await milestoneStatusResponse).ok()).toBe(true);
      await expect(completed).toBeChecked();

      expect(
        await expectJson(
          await asAlpha(
            `/rest/v1/deal_risks?id=eq.${webRiskId}&select=severity,status`,
          ),
          200,
        ),
      ).toEqual([{ severity: "high", status: "resolved" }]);
      expect(
        await expectJson(
          await asAlpha(
            `/rest/v1/deal_milestones?id=eq.${webMilestoneId}&select=completed`,
          ),
          200,
        ),
      ).toEqual([{ completed: true }]);
    });

    await test.step("Web creates a Follow-up linked to the Customer and Deal", async () => {
      await page.goto("/#/follow_ups/create");
      await expect(
        page.getByRole("heading", { name: "新建跟进", exact: true }),
      ).toBeVisible();
      await selectHostedChoice(page, "跟进类型", "电话");
      await selectHostedAutocomplete(page, "客户", alphaNames.company);
      await selectHostedAutocomplete(page, "项目", alphaNames.deal);
      await page
        .getByRole("textbox", { name: "备注", exact: true })
        .fill(alphaNames.webFollowUp);
      await page.getByRole("button", { name: "保存跟进", exact: true }).click();
      await expect(page).toHaveURL(/#\/follow_ups(?:\?.*)?$/);
      const webFollowUpRows = await expectJson<Array<{ id: string }>>(
        await asAlpha(
          `/rest/v1/follow_ups?company_id=eq.${alphaIds.company}&note=eq.${encodeURIComponent(alphaNames.webFollowUp)}&select=id`,
        ),
        200,
      );
      expect(webFollowUpRows).toHaveLength(1);
      webFollowUpId = webFollowUpRows[0].id;
      extraCleanupTargets.push(["follow_ups", `id=eq.${webFollowUpId}`]);
      expect(
        await expectJson<unknown[]>(
          await asBeta(`/rest/v1/follow_ups?id=eq.${webFollowUpId}&select=id`),
          200,
        ),
      ).toEqual([]);
    });

    await test.step("Follow-up list resolves the Customer and Deal references", async () => {
      await page.goto("/#/follow_ups");
      const followUpRow = page
        .locator("article")
        .filter({ hasText: alphaNames.followUp });
      await expect(followUpRow).toHaveCount(1);
      await expect(followUpRow).toContainText(alphaNames.company);
      await expect(followUpRow).toContainText(alphaNames.deal);
      await expect(
        page.getByText(betaNames.followUp, { exact: false }),
      ).toHaveCount(0);
    });

    await test.step("Dashboard aggregates only Alpha P0 data", async () => {
      const summary = await readDashboardSummary(asAlpha);
      expect(summary.open_reminder_count).toBeGreaterThanOrEqual(1);
      expect(summary.overdue_reminder_count).toBeGreaterThanOrEqual(1);
      expect(summary.high_risk_deal_count).toBeGreaterThanOrEqual(1);
      expect(summary.follow_up_count).toBeGreaterThanOrEqual(1);
      expect(summary.priority_reminders.map(({ id }) => id)).toContain(
        alphaIds.reminder,
      );
      expect(summary.priority_reminders.map(({ id }) => id)).not.toContain(
        betaIds.reminder,
      );

      await page.goto("/#/");
      await expect(
        page.getByRole("heading", { name: "今日工作台", exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole("region", { name: "业务概览", exact: true }),
      ).toBeVisible();
      const priority = page.getByRole("region", {
        name: "优先待办",
        exact: true,
      });
      await expect(priority).toContainText(alphaNames.company);
      await expect(priority).toContainText(alphaNames.deal);
      await expect(priority).not.toContainText(betaNames.company);
    });

    await test.step("Web creates a Reminder and executes every status command", async () => {
      await Promise.all([
        insert(asAlpha, "reminders", {
          id: reminderCommandIds.later,
          company_id: alphaIds.company,
          deal_id: alphaIds.deal,
          type: "paused",
          status: "pending",
          due_at: "2000-01-03T00:00:00.000Z",
          pause_reason: `Hosted pause ${suffix}`,
          priority: "high",
        }),
        insert(asAlpha, "reminders", {
          id: reminderCommandIds.ignore,
          company_id: alphaIds.company,
          deal_id: alphaIds.deal,
          type: "fixed_time",
          status: "pending",
          due_at: "2000-01-04T00:00:00.000Z",
          priority: "normal",
        }),
      ]);
      extraCleanupTargets.push(
        ["reminders", `id=eq.${reminderCommandIds.later}`],
        ["reminders", `id=eq.${reminderCommandIds.ignore}`],
      );

      await page.goto("/#/reminders/create");
      await expect(
        page.getByRole("heading", { name: "新建提醒", exact: true }),
      ).toBeVisible();
      await selectHostedAutocomplete(page, "客户", alphaNames.company);
      await selectHostedAutocomplete(page, "项目", alphaNames.deal);
      await selectHostedChoice(page, "提醒类型", "等待回复");
      await page.getByRole("button", { name: "保存提醒", exact: true }).click();
      await expect(page).toHaveURL(/#\/reminders(?:\?.*)?$/);

      const webReplyRows = await expectJson<Array<{ id: string }>>(
        await asAlpha(
          `/rest/v1/reminders?company_id=eq.${alphaIds.company}&type=eq.waiting_reply&id=neq.${alphaIds.reminder}&select=id&order=created_at.desc&limit=1`,
        ),
        200,
      );
      expect(webReplyRows).toHaveLength(1);
      webReplyReminderId = webReplyRows[0].id;
      extraCleanupTargets.push(["reminders", `id=eq.${webReplyReminderId}`]);

      const customerReminderRows = page
        .locator("article")
        .filter({ hasText: alphaNames.company })
        .filter({ hasText: alphaNames.deal });
      const replyRow = customerReminderRows
        .filter({ hasText: "等待回复" })
        .filter({ hasText: "待处理" });
      await expect(replyRow).toHaveCount(1);
      let statusResponse = waitForRpcResponse(
        page,
        "update_reminder_status_idempotent",
      );
      await replyRow
        .getByRole("button", { name: "已收到回复", exact: true })
        .click();
      expect((await statusResponse).ok()).toBe(true);
      await expect(replyRow.getByText("已回复", { exact: true })).toBeVisible();

      const laterRow = customerReminderRows.filter({ hasText: "暂停提醒" });
      await expect(laterRow).toHaveCount(1);
      statusResponse = waitForRpcResponse(
        page,
        "update_reminder_status_idempotent",
      );
      await laterRow.getByRole("button", { name: "稍后", exact: true }).click();
      expect((await statusResponse).ok()).toBe(true);
      await expect(laterRow.getByText("已稍后", { exact: true })).toBeVisible();

      const ignoreRow = customerReminderRows.filter({ hasText: "指定时间" });
      await expect(ignoreRow).toHaveCount(1);
      statusResponse = waitForRpcResponse(
        page,
        "update_reminder_status_idempotent",
      );
      await ignoreRow
        .getByRole("button", { name: "忽略", exact: true })
        .click();
      expect((await statusResponse).ok()).toBe(true);
      await expect(
        ignoreRow.getByText("已忽略", { exact: true }),
      ).toBeVisible();

      const completeRow = customerReminderRows
        .filter({ hasText: "等待回复" })
        .filter({ hasText: "已逾期" });
      await expect(completeRow).toHaveCount(1);
      statusResponse = waitForRpcResponse(
        page,
        "update_reminder_status_idempotent",
      );
      await completeRow
        .getByRole("button", { name: "完成", exact: true })
        .click();
      expect((await statusResponse).ok()).toBe(true);
      await expect(
        completeRow.getByText("已完成", { exact: true }),
      ).toBeVisible();

      expect(await readReminder(asAlpha, webReplyReminderId)).toMatchObject({
        id: webReplyReminderId,
        status: "replied",
        resolution: "reply_received",
      });
      expect(
        await readReminder(asAlpha, reminderCommandIds.later),
      ).toMatchObject({
        id: reminderCommandIds.later,
        status: "snoozed",
      });
      expect(
        await readReminder(asAlpha, reminderCommandIds.ignore),
      ).toMatchObject({
        id: reminderCommandIds.ignore,
        status: "ignored",
        resolution: "ignored",
      });
      expect(await readReminder(asAlpha, alphaIds.reminder)).toMatchObject({
        id: alphaIds.reminder,
        status: "completed",
        resolution: "completed",
      });
    });

    await test.step("Dashboard and Customer detail reflect hosted writes with Beta isolation", async () => {
      await insert(asAlpha, "reminders", {
        id: reminderCommandIds.dashboard,
        company_id: alphaIds.company,
        deal_id: alphaIds.deal,
        type: "fixed_time",
        status: "pending",
        due_at: "2000-01-05T00:00:00.000Z",
        priority: "urgent",
      });
      extraCleanupTargets.push([
        "reminders",
        `id=eq.${reminderCommandIds.dashboard}`,
      ]);

      const summary = await readDashboardSummary(asAlpha);
      expect(summary.follow_up_count).toBeGreaterThanOrEqual(2);
      expect(summary.priority_reminders.map(({ id }) => id)).toContain(
        reminderCommandIds.dashboard,
      );
      expect(summary.priority_reminders.map(({ id }) => id)).not.toContain(
        betaIds.reminder,
      );

      await page.goto("/#/");
      const priority = page.getByRole("region", {
        name: "优先待办",
        exact: true,
      });
      await expect(priority).toContainText(alphaNames.company);
      await expect(priority).toContainText(alphaNames.deal);
      await expect(priority).not.toContainText(betaNames.company);

      await page.goto(`/#/companies/${alphaIds.company}/show`);
      await expect(
        page
          .getByRole("region", { name: "联系人", exact: true })
          .getByText(alphaNames.webContactUpdated, { exact: false }),
      ).toBeVisible();
      await expect(
        page
          .getByRole("region", { name: "社媒账号", exact: true })
          .getByText(alphaNames.socialAccount, { exact: false }),
      ).toBeVisible();
      await expect(
        page
          .getByRole("region", { name: "项目", exact: true })
          .getByText(alphaNames.deal, { exact: true }),
      ).toBeVisible();
      await expect(
        page
          .getByRole("region", { name: "最近跟进", exact: true })
          .getByText(alphaNames.webFollowUp, { exact: true }),
      ).toBeVisible();
      await expect(
        page
          .getByRole("region", { name: "未完成提醒", exact: true })
          .getByText("指定时间", { exact: true }),
      ).toBeVisible();

      for (const [resource, id] of [
        ["contacts", webContactId],
        ["deal_risks", webRiskId],
        ["deal_milestones", webMilestoneId],
        ["follow_ups", webFollowUpId],
        ["reminders", webReplyReminderId],
      ] as const) {
        expect(id, `Missing Web-created ${resource} ID`).toBeTruthy();
        expect(
          await expectJson<unknown[]>(
            await asBeta(`/rest/v1/${resource}?id=eq.${id}&select=id`),
            200,
          ),
          `Beta must not read Alpha Web-created ${resource}`,
        ).toEqual([]);
      }
    });
  } finally {
    await closeContext(context);
    for (const [resource, filter] of extraCleanupTargets.reverse()) {
      const response = await asAlpha(`/rest/v1/${resource}?${filter}`, {
        method: "DELETE",
      });
      expect(
        response.ok,
        `Preview P0 extra cleanup failed for ${resource} with HTTP ${response.status}: ${await response.text()}`,
      ).toBe(true);
    }
    await cleanupP0Fixture(asAlpha, alphaIds);
    await cleanupP0Fixture(asBeta, betaIds);
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

const waitForRpcResponse = (page: Page, name: string) =>
  page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      response.request().method() === "POST" &&
      url.pathname.endsWith(`/rest/v1/rpc/${name}`)
    );
  });

const observeExportDiagnostics = (page: Page) => {
  const events: string[] = [];
  const onResponse = (response: PlaywrightResponse) => {
    const request = response.request();
    const url = new URL(response.url());
    if (
      request.method() === "GET" &&
      (url.pathname.includes("/rest/v1/") ||
        url.pathname.includes("/functions/v1/"))
    ) {
      events.push(
        `${request.method()} ${url.pathname} -> ${response.status()}`,
      );
    }
  };
  const onRequestFailed = (request: Request) => {
    const url = new URL(request.url());
    events.push(
      `${request.method()} ${url.pathname} -> requestfailed: ${request.failure()?.errorText ?? "unknown"}`,
    );
  };
  const onPageError = (error: Error) =>
    events.push(`pageerror: ${error.message}`);
  page.on("response", onResponse);
  page.on("requestfailed", onRequestFailed);
  page.on("pageerror", onPageError);

  return {
    dispose() {
      page.off("response", onResponse);
      page.off("requestfailed", onRequestFailed);
      page.off("pageerror", onPageError);
    },
    async summary() {
      const alerts = await page
        .locator('[role="alert"]')
        .allTextContents()
        .catch(() => []);
      const button = page.getByRole("button", {
        name: /导出 Excel|正在导出/,
      });
      const buttonState = await button
        .evaluate((element: HTMLButtonElement) => ({
          disabled: element.disabled,
          text: element.textContent?.trim() ?? "",
        }))
        .catch(() => ({ disabled: true, text: "unavailable" }));
      return `button=${JSON.stringify(buttonState)}; alerts=${JSON.stringify(alerts)}; network=${JSON.stringify(events)}`;
    },
  };
};

const closeContext = async (context: BrowserContext) => {
  try {
    await context.close();
  } catch (error) {
    if (
      error instanceof Error &&
      /Failed to find context|Target page, context or browser has been closed/.test(
        error.message,
      )
    ) {
      return;
    }
    throw error;
  }
};

const selectImportSource = async (
  page: Page,
  fieldLabel: string,
  sourceColumn: string,
) => {
  await page.getByLabel(`${fieldLabel}源列`, { exact: true }).click();
  await page.getByRole("option", { name: sourceColumn, exact: true }).click();
  await expect(
    page.getByLabel(`${fieldLabel}源列`, { exact: true }),
  ).toContainText(sourceColumn);
};

const selectHostedAutocomplete = async (
  page: Page,
  label: string,
  option: string,
) => {
  const closeToasts = page.getByRole("button", { name: "Close toast" });
  await closeToasts.evaluateAll((buttons) =>
    buttons.forEach((button) => (button as HTMLButtonElement).click()),
  );
  const trigger = page.getByRole("combobox", { name: label, exact: true });
  await trigger.click();
  const search = page.getByRole("combobox").last();
  await expect(search).toBeVisible();
  await search.fill(option);
  const choice = page.getByRole("option", { name: option, exact: true });
  await expect(choice).toBeVisible();
  await choice.click();
  await expect(trigger).toContainText(option);
};

const selectHostedChoice = async (
  page: Page,
  label: string,
  option: string,
) => {
  const trigger = page.getByRole("combobox", { name: label, exact: true });
  await trigger.click();
  await page.getByRole("option", { name: option, exact: true }).click();
  await expect(trigger).toContainText(option);
};

const waitForPostgrestResponse = (
  page: Page,
  method: "GET" | "PATCH",
  resource: string,
  id: string,
) =>
  page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      response.request().method() === method &&
      url.pathname.endsWith(`/rest/v1/${resource}`) &&
      url.searchParams.get("id") === `eq.${id}`
    );
  });

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

type DashboardSummary = {
  open_reminder_count: number;
  overdue_reminder_count: number;
  high_risk_deal_count: number;
  follow_up_count: number;
  priority_reminders: Array<{ id: string }>;
};

const readDashboardSummary = async (request: AuthenticatedRequest) => {
  const response = await expectJson<{ data: DashboardSummary }>(
    await request("/rest/v1/rpc/get_dashboard_summary", {
      method: "POST",
      body: "{}",
    }),
    200,
  );
  return response.data;
};

const cleanupP0Fixture = async (
  request: AuthenticatedRequest,
  ids: {
    company: string;
    contact: string;
    socialAccount: string;
    deal: string;
    risk: string;
    milestone: string;
    followUp: string;
    reminder: string;
  },
) => {
  const targets = [
    ["reminders", `id=eq.${ids.reminder}`],
    ["follow_ups", `id=eq.${ids.followUp}`],
    ["deal_risks", `id=eq.${ids.risk}`],
    ["deal_milestones", `id=eq.${ids.milestone}`],
    ["deal_contacts", `deal_id=eq.${ids.deal}&contact_id=eq.${ids.contact}`],
    ["deals", `id=eq.${ids.deal}`],
    ["social_accounts", `id=eq.${ids.socialAccount}`],
    ["contacts", `id=eq.${ids.contact}`],
    ["companies", `id=eq.${ids.company}`],
  ] as const;

  for (const [resource, filter] of targets) {
    const response = await request(`/rest/v1/${resource}?${filter}`, {
      method: "DELETE",
    });
    expect(
      response.ok,
      `Preview P0 cleanup failed for ${resource} with HTTP ${response.status}: ${await response.text()}`,
    ).toBe(true);
  }

  for (const [resource, filter] of targets) {
    expect(
      await expectJson<unknown[]>(
        await request(`/rest/v1/${resource}?${filter}&select=*`),
        200,
      ),
      `Preview P0 cleanup left ${resource} rows behind`,
    ).toEqual([]);
  }
};

const sheetRows = (
  workbook: XLSX.WorkBook,
  sheetName: string,
): Array<Record<string, unknown>> => {
  const sheet = workbook.Sheets[sheetName];
  expect(sheet, `Missing XLSX sheet: ${sheetName}`).toBeDefined();
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet!);
};

const expectJson = async <T>(
  response: Response,
  status: number,
): Promise<T> => {
  const text = await response.text();
  expect(response.status, text).toBe(status);
  return JSON.parse(text) as T;
};
