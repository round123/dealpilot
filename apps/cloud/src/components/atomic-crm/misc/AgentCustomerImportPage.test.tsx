import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router";
import { render } from "vitest-browser-react";
import { ApiError } from "@dealpilot/api-client";

import type { CustomerImportOperations } from "../providers/importOperations";
import {
  AgentCustomerImportPage,
} from "./AgentCustomerImportPage";
import { importErrorMessage } from "./importErrorMessage";

const jobId = "11111111-1111-4111-8111-111111111111";
const customerId = "22222222-2222-4222-8222-222222222222";

function createOperations() {
  const parseFile = vi.fn(
    async (
      _file: File,
      options?: Parameters<CustomerImportOperations["parseFile"]>[1],
    ) =>
      options?.mapping
        ? {
            job_id: jobId,
            total_rows: 2,
            valid_rows: 1,
            errors: [{ row: 2, field: "name", message: "客户名称不能为空" }],
            duplicate_candidates: [
              {
                row_index: 1,
                incoming: {
                  name: "华东贸易有限公司",
                  company: "新公司",
                  country: null,
                  source: null,
                  grade: "B" as const,
                  contact_name: null,
                  email: "buyer@example.com",
                  phone: null,
                  platform: "telegram",
                  platform_account: "@buyer",
                },
                matches: [
                  {
                    existing_customer_id: customerId,
                    matched_by: ["email" as const, "platform_account" as const],
                    existing: {
                      customer_id: customerId,
                      name: "华东贸易",
                      company: "原公司",
                      country: null,
                      source: null,
                      grade: "B" as const,
                      contact_name: null,
                      email: "buyer@example.com",
                      phone: null,
                      platform: "telegram",
                      platform_account: "@buyer",
                    },
                    conflicts: [
                      {
                        field: "company" as const,
                        existing_value: "原公司",
                        incoming_value: "新公司",
                      },
                    ],
                  },
                ],
              },
            ],
            name_company_hints: [
              {
                row_index: 2,
                existing_customer_id: "44444444-4444-4444-8444-444444444444",
                matched_by: ["company" as const],
                existing_name: "名称相似客户",
                existing_company: "新公司",
                incoming_name: "另一条导入记录",
                incoming_company: "新公司",
              },
            ],
            source_columns: ["客户简称", "采购邮箱", "备注"],
            preview: [
              { name: "华东贸易有限公司", email: "buyer@example.com" },
              { name: "", email: "invalid@example.com" },
            ],
          }
        : {
            job_id: "33333333-3333-4333-8333-333333333333",
            total_rows: 2,
            valid_rows: 0,
            errors: [
              { row: 1, field: "name", message: "客户名称不能为空" },
              { row: 2, field: "name", message: "客户名称不能为空" },
            ],
            duplicate_candidates: [],
            name_company_hints: [],
            source_columns: ["客户简称", "采购邮箱", "备注"],
            preview: [
              {
                客户简称: "华东贸易有限公司",
                采购邮箱: "buyer@example.com",
                备注: "不导入",
              },
              {
                客户简称: "",
                采购邮箱: "invalid@example.com",
                备注: "错误行",
              },
            ],
          },
  );
  const commit = vi.fn(async () => ({
    success: 1,
    failed: 1,
    skipped: 0,
    duplicates: 0,
    warnings: [
      {
        code: "PLATFORM_ACCOUNT_NOT_COPIED" as const,
        row_index: 1,
        field: "platform_account" as const,
        platform: "telegram",
        platform_account: "@buyer",
        existing_customer_id: customerId,
      },
    ],
  }));
  const downloadErrors = vi.fn(
    async () => new Blob(["row,field,message"], { type: "text/csv" }),
  );
  return {
    operations: {
      parseFile,
      commit,
      downloadErrors,
    } satisfies CustomerImportOperations,
    parseFile,
    commit,
  };
}

describe("Agent customer import page", () => {
  it("shows actionable Chinese guidance for storage capacity failures", () => {
    expect(importErrorMessage(new ApiError({
      code: "STORAGE_ERROR",
      status: 507,
      message: "database or disk is full",
    }))).toBe("本地存储空间不足，请释放空间，或先备份后重试。");
  });

  it("maps non-standard columns before duplicate resolution and commit", async () => {
    const { operations, parseFile, commit } = createOperations();
    const queryClient = new QueryClient();
    const invalidateQueries = vi.spyOn(queryClient, "invalidateQueries");
    const screen = await render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <AgentCustomerImportPage operations={operations} />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    const file = new File(
      ["名称,邮箱\n华东贸易有限公司,buyer@example.com"],
      "客户.csv",
      {
        type: "text/csv",
      },
    );
    const input =
      document.querySelector<HTMLInputElement>('input[type="file"]');
    expect(input).not.toBeNull();
    const transfer = new DataTransfer();
    transfer.items.add(file);
    Object.defineProperty(input, "files", {
      configurable: true,
      value: transfer.files,
    });
    input!.dispatchEvent(new Event("change", { bubbles: true }));

    await expect.element(screen.getByText("客户.csv")).toBeVisible();
    await screen.getByRole("button", { name: "解析并继续" }).click();
    await expect
      .element(screen.getByRole("heading", { name: "字段映射" }))
      .toBeVisible();
    expect(parseFile).toHaveBeenCalledWith(file, {
      signal: expect.any(AbortSignal),
    });
    await expect
      .element(screen.getByRole("button", { name: "下一步" }))
      .toBeDisabled();

    await screen.getByRole("combobox", { name: "客户名称源列" }).click();
    await screen.getByRole("option", { name: "客户简称" }).click();
    await screen.getByRole("combobox", { name: "邮箱源列" }).click();
    await expect
      .element(screen.getByRole("option", { name: "客户简称" }))
      .toBeDisabled();
    await screen.getByRole("option", { name: "采购邮箱" }).click();
    await screen.getByRole("button", { name: "下一步" }).click();
    expect(parseFile).toHaveBeenLastCalledWith(file, {
      signal: expect.any(AbortSignal),
      mapping: { name: "客户简称", email: "采购邮箱" },
    });
    await expect.element(screen.getByText("重复候选 (1)")).toBeVisible();
    await screen.getByRole("tab", { name: "重复候选 (1)" }).click();
    await expect.element(screen.getByText("华东贸易有限公司")).toBeVisible();
    await expect.element(screen.getByText("现有值（保留）")).toBeVisible();
    await expect.element(screen.getByText("原公司")).toBeVisible();
    await expect.element(screen.getByText("新公司")).toBeVisible();
    await expect.element(screen.getByText("名称或公司相同提示")).toBeVisible();
    await screen.getByRole("button", { name: "全部新建" }).click();
    await screen.getByRole("button", { name: "确认导入" }).click();

    await expect.element(screen.getByText("导入完成")).toBeVisible();
    await expect.element(screen.getByText("部分平台账号未复制")).toBeVisible();
    await expect
      .element(screen.getByText("第 1 行：Telegram / @buyer"))
      .toBeVisible();
    await expect
      .element(screen.getByText("请为本次导入创建加密备份"))
      .toBeVisible();
    await expect
      .element(screen.getByRole("link", { name: "前往备份与恢复" }))
      .toHaveAttribute("href", "/settings/local-data");
    expect(commit).toHaveBeenCalledWith(
      {
        job_id: jobId,
        resolutions: [{ row_index: 1, action: "new" }],
      },
      { idempotencyKey: expect.any(String) },
    );
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: ["companies"],
    });
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: ["contacts"],
    });
  });
});
