import { render } from "vitest-browser-react";
import type * as RaCore from "ra-core";

import {
  LocalDataOperationsProvider,
  type LocalDataOperations,
} from "../providers/localDataOperations";

const mocks = vi.hoisted(() => ({ notify: vi.fn() }));

vi.mock("ra-core", async (importOriginal) => {
  const actual = await importOriginal<typeof RaCore>();
  return { ...actual, useNotify: () => mocks.notify };
});

import {
  LOCAL_PRIVACY_NOTICE_KEY,
  LocalPrivacyGuard,
  LocalPrivacyNotice,
} from "./LocalPrivacyNotice";
import { UsageMetricsCard } from "./UsageMetricsCard";
import { ExtensionInstallGuide } from "./ExtensionInstallGuide";

describe("local privacy onboarding and usage metrics", () => {
  beforeEach(() => {
    localStorage.removeItem(LOCAL_PRIVACY_NOTICE_KEY);
    mocks.notify.mockReset();
  });

  it("requires first-use acknowledgement and explains permissions and storage", async () => {
    const screen = await render(
      <LocalDataOperationsProvider operations={operations()}>
        <LocalPrivacyNotice firstUse />
      </LocalDataOperationsProvider>,
    );

    await expect
      .element(screen.getByRole("heading", {
        name: "开始使用前，请了解本地数据与扩展权限",
      }))
      .toBeVisible();
    await expect.element(screen.getByText("扩展权限用途")).toBeVisible();
    await expect
      .element(screen.getByText("C:\\DealPilot\\data\\dealpilot.db"))
      .toBeVisible();
    await expect.element(screen.getByText("删除方式")).toBeVisible();

    await screen.getByRole("button", { name: "我已了解，开始使用" }).click();
    expect(localStorage.getItem(LOCAL_PRIVACY_NOTICE_KEY)).toBe("accepted");
  });

  it("guards first entry even when the rendered page is a deep link", async () => {
    const screen = await render(
      <LocalDataOperationsProvider operations={operations()}>
        <LocalPrivacyGuard>
          <main>客户详情深链</main>
        </LocalPrivacyGuard>
      </LocalDataOperationsProvider>,
    );

    await expect.element(screen.getByText("客户详情深链")).toBeVisible();
    await expect.element(screen.getByRole("dialog")).toBeVisible();
    await expect.element(screen.getByRole("button", {
      name: "我已了解，开始使用",
    })).toBeVisible();
  });

  it("keeps the notice available in settings and exports aggregate-only metrics", async () => {
    const exportUsageMetrics = vi.fn().mockResolvedValue(
      new Blob(["{}"], { type: "application/json" }),
    );
    const screen = await render(
      <LocalDataOperationsProvider operations={operations({ exportUsageMetrics })}>
        <LocalPrivacyNotice />
        <UsageMetricsCard />
      </LocalDataOperationsProvider>,
    );

    await expect
      .element(screen.getByText("隐私、权限与本地数据说明"))
      .toBeVisible();
    await expect
      .element(screen.getByRole("heading", { name: "扩展权限用途" }))
      .toBeVisible();
    await expect.element(screen.getByText("90.0%")).toBeVisible();
    await expect.element(screen.getByText("95.0%")).toBeVisible();
    await expect.element(screen.getByText("75.0%")).toBeVisible();
    await expect.element(screen.getByText(
      "仅统计已明确确认或纠正的自动匹配，未评价样本不进入分母；目标 95%",
    )).toBeVisible();
    await screen.getByRole("button", { name: "导出脱敏统计报告" }).click();

    expect(exportUsageMetrics).toHaveBeenCalledTimes(1);
    expect(mocks.notify).toHaveBeenCalledWith(
      "脱敏统计报告已导出，未上传任何数据",
      { type: "success" },
    );
  });

  it("opens configured browser stores from the extension guide", async () => {
    const screen = await render(
      <ExtensionInstallGuide urls={{
        chrome: "https://chromewebstore.google.com/detail/dealpilot/example",
        edge: "https://microsoftedge.microsoft.com/addons/detail/dealpilot/example",
      }} />,
    );

    await expect.element(screen.getByRole("link", { name: /Chrome Web Store/ }))
      .toHaveAttribute("href", "https://chromewebstore.google.com/detail/dealpilot/example");
    await expect.element(screen.getByRole("link", { name: /Edge Add-ons/ }))
      .toHaveAttribute("href", "https://microsoftedge.microsoft.com/addons/detail/dealpilot/example");
  });

  it("falls back to unpacked-extension and re-pair instructions", async () => {
    const screen = await render(
      <ExtensionInstallGuide urls={{
        chrome: "http://insecure.example/extension",
        edge: "https://example.com/not-the-edge-store",
      }} />,
    );

    await expect.element(screen.getByText("商店版本尚未配置", { exact: false }))
      .toBeVisible();
    await expect.element(screen.getByText(/Programs\\DealPilot\\extension/))
      .toBeVisible();
    await expect.element(screen.getByText("安装或重新安装扩展后会自动配对", { exact: false }))
      .toBeVisible();
    await expect.element(screen.getByRole("link")).not.toBeInTheDocument();
  });
});

function operations(overrides: Partial<LocalDataOperations> = {}): LocalDataOperations {
  return {
    createBackup: vi.fn(),
    validateBackup: vi.fn(),
    restoreBackup: vi.fn(),
    exportAll: vi.fn(),
    getUsageMetrics: vi.fn().mockResolvedValue({
      window_days: 30,
      window_start: "2026-07-01T00:00:00.000Z",
      window_end: "2026-07-31T00:00:00.000Z",
      on_time_completion: {
        numerator: 18,
        denominator: 20,
        rate: 0.9,
        target: 0.9,
        minimum_sample: 20,
      },
      match_accuracy: {
        numerator: 19,
        denominator: 20,
        rate: 0.95,
        target: 0.95,
      },
      reminder_handling: {
        numerator: 3,
        denominator: 4,
        rate: 0.75,
        target: 0.9,
      },
    }),
    exportUsageMetrics: vi.fn(),
    getInfo: vi.fn().mockResolvedValue({
      data_path: "C:\\DealPilot\\data\\dealpilot.db",
      database_size_bytes: 4096,
      occupied_size_bytes: 8192,
      recovery_size_bytes: 0,
      last_backup_at: null,
      backup_reminder_days: 7,
      backup_recommendation: "not_needed",
      has_business_data: false,
      auto_start_supported: false,
    }),
    getSettings: vi.fn(),
    updateSettings: vi.fn(),
    clearData: vi.fn(),
    ...overrides,
  };
}
