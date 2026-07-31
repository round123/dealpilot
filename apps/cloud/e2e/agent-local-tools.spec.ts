import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import * as XLSX from "xlsx";
import {
  assertAgentUsedLoopbackOnly,
  installAgentLoopbackNetworkGuard,
} from "./agent-loopback-network";

const expectedSheets = [
  "客户",
  "联系人",
  "社媒账号",
  "项目",
  "跟进",
  "提醒",
  "风险",
  "里程碑",
] as const;

test.beforeEach(async ({ page }) => {
  await installAgentLoopbackNetworkGuard(page);
  const agentDataDir = process.env.DEALPILOT_AGENT_E2E_DATA_DIR;
  if (!agentDataDir) {
    throw new Error("Agent E2E data directory is not configured");
  }

  const runtimeInfoPath = path.join(agentDataDir, "agent.runtime.json");
  let token: string | undefined;
  await expect
    .poll(async () => {
      try {
        const runtime = JSON.parse(
          await readFile(runtimeInfoPath, "utf-8"),
        ) as {
          token?: unknown;
        };
        token = typeof runtime.token === "string" ? runtime.token : undefined;
        return Boolean(token);
      } catch {
        return false;
      }
    })
    .toBe(true);

  await page.goto(`/?token=${encodeURIComponent(token!)}#/`);
});

test.afterEach(async ({ page }, testInfo) => {
  await assertAgentUsedLoopbackOnly(page, testInfo);
});

test("本地 Agent 支持字段映射导入、加密备份校验和八域 Excel 导出", async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000);

  const suffix = Date.now().toString(36);
  const customerName = `映射导入客户-${suffix}`;
  const password = `DealPilot-${suffix}`;
  const csv = [
    "客户全称,所在企业,联系人邮箱",
    `${customerName},映射测试企业-${suffix},mapping-${suffix}@example.com`,
  ].join("\n");

  await test.step("非标准列名通过 UI 映射后写入客户列表", async () => {
    await page.goto("/#/import");
    await page.locator('input[type="file"]').setInputFiles({
      name: `customer-mapping-${suffix}.csv`,
      mimeType: "text/csv",
      buffer: Buffer.from(`\uFEFF${csv}`, "utf-8"),
    });
    await page.getByRole("button", { name: "解析并继续", exact: true }).click();

    await expect(
      page.getByRole("heading", { name: "字段映射", exact: true }),
    ).toBeVisible();
    await selectOption(page, "客户名称源列", "客户全称");
    await selectOption(page, "公司源列", "所在企业");
    await selectOption(page, "邮箱源列", "联系人邮箱");
    await page.getByRole("button", { name: "下一步", exact: true }).click();

    await expect(page.getByText(customerName, { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "确认导入", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "导入完成", exact: true }),
    ).toBeVisible();
    await page.getByRole("link", { name: "查看客户列表", exact: true }).click();
    await expect(page.getByText(customerName, { exact: true })).toBeVisible();
  });

  await test.step("下载的加密备份可重新上传并通过完整性校验", async () => {
    await page.goto("/#/settings/local-data");
    await page.getByLabel("备份密码", { exact: true }).fill(password);
    await page.getByLabel("确认密码", { exact: true }).fill(password);

    const backupDownload = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "创建并下载备份", exact: true })
      .click();
    const backup = await backupDownload;
    expect(backup.suggestedFilename()).toMatch(/\.dpbk$/);
    const backupPath = testInfo.outputPath("roundtrip-backup.dpbk");
    await backup.saveAs(backupPath);

    await page.locator("#restore-file").setInputFiles(backupPath);
    await page.getByLabel("恢复密码", { exact: true }).fill(password);
    await page.getByRole("button", { name: "校验备份", exact: true }).click();
    await expect(
      page.getByText("完整性校验通过", { exact: true }),
    ).toBeVisible();
  });

  await test.step("全域 Excel 包含八个业务工作表", async () => {
    const exportDownload = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "导出全部数据", exact: true })
      .click();
    const exported = await exportDownload;
    expect(exported.suggestedFilename()).toMatch(/\.xlsx$/);
    const exportPath = testInfo.outputPath("all-business-data.xlsx");
    await exported.saveAs(exportPath);

    const workbook = XLSX.read(await readFile(exportPath), { type: "buffer" });
    expect(workbook.SheetNames).toEqual(expectedSheets);
    for (const sheetName of expectedSheets) {
      expect(workbook.Sheets[sheetName]).toBeDefined();
    }
  });
});

async function selectOption(page: Page, label: string, option: string) {
  await page.getByRole("combobox", { name: label, exact: true }).click();
  await page.getByRole("option", { name: option, exact: true }).click();
}
