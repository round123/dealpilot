import { render } from "vitest-browser-react";
import type * as RaCore from "ra-core";

import { LocalDataOperationsProvider } from "../providers/localDataOperations";
import type { LocalDataOperations } from "../providers/localDataOperations";

const mocks = vi.hoisted(() => ({
  notify: vi.fn(),
  validateBackup: vi.fn(),
  restoreBackup: vi.fn(),
  clearData: vi.fn(),
}));

vi.mock("ra-core", async (importOriginal) => {
  const actual = await importOriginal<typeof RaCore>();
  return { ...actual, useNotify: () => mocks.notify };
});

import { LocalDataToolsPage } from "./LocalDataToolsPage";

describe("LocalDataToolsPage restore flow", () => {
  beforeEach(() => {
    mocks.notify.mockReset();
    mocks.validateBackup.mockReset();
    mocks.restoreBackup.mockReset();
    mocks.clearData.mockReset();
  });

  it("blocks restore after failed validation and requires RESTORE after success", async () => {
    mocks.validateBackup
      .mockResolvedValueOnce({ valid: false, integrity_ok: false })
      .mockResolvedValueOnce({
        valid: true,
        integrity_ok: true,
        schema_version: 2,
        app_version: "0.1.0",
      });
    mocks.restoreBackup.mockReturnValue(new Promise(() => undefined));
    const operations: LocalDataOperations = {
      createBackup: vi.fn(),
      validateBackup: mocks.validateBackup,
      restoreBackup: mocks.restoreBackup,
      exportAll: vi.fn(),
      getUsageMetrics: vi.fn().mockResolvedValue(emptyMetrics()),
      exportUsageMetrics: vi.fn(),
      getInfo: vi.fn().mockResolvedValue({
        data_path: "C:\\DealPilot\\data\\dealpilot.db",
        database_size_bytes: 4096,
        occupied_size_bytes: 8192,
        recovery_size_bytes: 16384,
        last_backup_at: null,
        backup_reminder_days: 7,
        backup_recommendation: "not_needed",
        has_business_data: false,
        auto_start_supported: false,
      }),
      getSettings: vi.fn().mockResolvedValue({
        last_backup_at: null,
        auto_start: false,
        minimize_to_tray: true,
        backup_reminder_days: 7,
        locale: "zh-CN",
        theme: "light",
      }),
      updateSettings: vi.fn(),
      clearData: mocks.clearData,
    };
    const screen = await render(
      <LocalDataOperationsProvider operations={operations}>
        <LocalDataToolsPage />
      </LocalDataOperationsProvider>,
    );

    await expect
      .element(
        screen.getByText("数据库 4.0 KB，含 WAL/SHM 的运行文件共占用 8.0 KB"),
      )
      .toBeVisible();
    await expect
      .element(screen.getByText("迁移恢复点 16.0 KB，本地合计 24.0 KB"))
      .toBeVisible();

    setFileInput(
      screen.getByLabelText("备份文件").element() as HTMLInputElement,
      new File(["encrypted-backup"], "backup.dpbk"),
    );
    await screen.getByLabelText("恢复密码").fill("correct-password");
    await screen.getByRole("button", { name: "校验备份" }).click();

    await expect
      .element(screen.getByText("校验未通过，恢复操作已禁止。"))
      .toBeVisible();
    expect(mocks.restoreBackup).not.toHaveBeenCalled();

    await screen.getByRole("button", { name: "校验备份" }).click();
    await screen.getByRole("button", { name: "准备恢复" }).click();
    await expect
      .element(screen.getByRole("button", { name: "确认恢复" }))
      .toBeDisabled();

    await screen.getByLabelText("确认文字").fill("RESTORE");
    await screen.getByRole("button", { name: "确认恢复" }).click();

    expect(mocks.restoreBackup).toHaveBeenCalledTimes(1);
    expect(mocks.restoreBackup).toHaveBeenCalledWith(
      expect.any(File),
      "correct-password",
      "RESTORE",
    );
  });

  it("requires the full clear phrase after opening the danger dialog", async () => {
    mocks.clearData.mockReturnValue(new Promise(() => undefined));
    const operations: LocalDataOperations = {
      createBackup: vi.fn(),
      validateBackup: vi.fn(),
      restoreBackup: vi.fn(),
      exportAll: vi.fn(),
      getUsageMetrics: vi.fn().mockResolvedValue(emptyMetrics()),
      exportUsageMetrics: vi.fn(),
      getInfo: vi.fn().mockResolvedValue({
        data_path: "C:\\DealPilot\\data\\dealpilot.db",
        database_size_bytes: 4096,
        occupied_size_bytes: 8192,
        recovery_size_bytes: 16384,
        last_backup_at: null,
        backup_reminder_days: 7,
        backup_recommendation: "first_import",
        has_business_data: true,
        auto_start_supported: false,
      }),
      getSettings: vi.fn().mockResolvedValue({
        last_backup_at: null,
        auto_start: false,
        minimize_to_tray: true,
        backup_reminder_days: 7,
        locale: "zh-CN",
        theme: "light",
      }),
      updateSettings: vi.fn(),
      clearData: mocks.clearData,
    };
    const screen = await render(
      <LocalDataOperationsProvider operations={operations}>
        <LocalDataToolsPage />
      </LocalDataOperationsProvider>,
    );

    await expect
      .element(screen.getByText("首次导入已完成，请创建加密备份"))
      .toBeVisible();
    await screen.getByRole("button", { name: "清空全部数据" }).click();
    const confirmButton = screen.getByRole("button", { name: "确认清空" });
    await expect.element(confirmButton).toBeDisabled();
    await screen.getByLabelText("确认文字").fill("CLEAR");
    await expect.element(confirmButton).toBeDisabled();
    await screen.getByLabelText("确认文字").fill("CLEAR ALL DATA");
    await confirmButton.click();

    expect(mocks.clearData).toHaveBeenCalledWith("CLEAR ALL DATA");
  });
});

function setFileInput(input: HTMLInputElement, file: File) {
  const transfer = new DataTransfer();
  transfer.items.add(file);
  input.files = transfer.files;
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

function emptyMetrics() {
  const metric = { numerator: 0, denominator: 0, rate: null, target: 0.9 };
  return {
    window_days: 30 as const,
    window_start: "2026-07-01T00:00:00.000Z",
    window_end: "2026-07-31T00:00:00.000Z",
    on_time_completion: { ...metric, minimum_sample: 20 },
    match_accuracy: { ...metric, target: 0.95 },
    reminder_handling: metric,
  };
}
