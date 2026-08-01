import {
  API_ERROR_CODES,
  ApiError,
  V1_MIGRATION_COLLECTIONS,
  type V1MigrationBundle,
} from "@dealpilot/api-client";
import { CoreAdminContext } from "ra-core";
import fakeDataProvider from "ra-data-fakerest";
import { render } from "vitest-browser-react";

const mocks = vi.hoisted(() => ({
  parseBundle: vi.fn(),
  upload: vi.fn(),
  confirm: vi.fn(),
  abandon: vi.fn(),
}));

vi.mock("../providers/apiClient", () => ({
  getCloudApiClient: () => ({ migrations: mocks }),
}));

import { V1MigrationSection } from "./V1MigrationSection";

const jobId = "10000000-0000-4000-8000-000000000001";
const sha = "a".repeat(64);
const counts = Object.fromEntries(
  V1_MIGRATION_COLLECTIONS.map((name) => [name, name === "companies" ? 2 : 0]),
);

const fixture = {
  collections: Object.fromEntries(
    V1_MIGRATION_COLLECTIONS.map((name) => [name, { count: counts[name] }]),
  ),
  source: { snapshot_sha256: sha },
} as V1MigrationBundle;

const reconciliation = {
  id: jobId,
  status: "awaiting_confirmation" as const,
  ready: true,
  actual_counts: counts,
  actual_checksums: Object.fromEntries(
    V1_MIGRATION_COLLECTIONS.map((name) => [name, sha]),
  ),
  differences: [],
};

const i18nProvider = {
  translate: (key: string, options?: { _?: unknown }) =>
    typeof options?._ === "string" ? options._ : key,
  changeLocale: () => Promise.resolve(),
  getLocale: () => "zh-CN",
};

const renderSection = () =>
  render(
    <CoreAdminContext
      dataProvider={fakeDataProvider({})}
      i18nProvider={i18nProvider}
    >
      <V1MigrationSection />
    </CoreAdminContext>,
  );

const migrationFile = () =>
  new File([JSON.stringify({ format: "fixture" })], "v1.bundle.json", {
    type: "application/json",
  });

describe("V1MigrationSection", () => {
  beforeEach(() => {
    mocks.parseBundle.mockReset().mockResolvedValue(fixture);
    mocks.upload.mockReset().mockResolvedValue({
      job: { id: jobId, status: "running" },
      reconciliation,
    });
    mocks.confirm.mockReset().mockResolvedValue({
      id: jobId,
      status: "confirmed",
      confirmed_at: "2026-08-01T10:00:00.000Z",
      imported_counts: counts,
      staging_cleared: true,
    });
    mocks.abandon.mockReset().mockResolvedValue({
      id: jobId,
      status: "abandoned",
      staging_cleared: true,
    });
  });

  it("validates, uploads and requires explicit confirmation", async () => {
    const screen = await renderSection();

    await screen.getByLabelText("V1 迁移包").upload(migrationFile());
    await expect.poll(() => mocks.parseBundle.mock.calls.length).toBe(1);
    await expect.element(screen.getByText(/共 2 条待迁移记录/)).toBeVisible();

    await screen.getByRole("button", { name: "上传并核对" }).click();
    await expect.poll(() => mocks.upload.mock.calls.length).toBe(1);
    await expect.element(screen.getByText("核对通过，等待确认")).toBeVisible();
    await expect.element(screen.getByLabelText("V1 迁移包")).toBeDisabled();
    await expect
      .element(
        screen.getByText("当前迁移任务已绑定此文件；如需更换，请先放弃迁移。"),
      )
      .toBeVisible();

    await screen.getByRole("button", { name: "确认迁移", exact: true }).click();
    const dialog = screen.getByRole("dialog");
    const confirmButton = dialog.getByRole("button", {
      name: "确认迁移",
      exact: true,
    });
    await expect.element(confirmButton).toBeDisabled();
    await dialog.getByLabelText("输入“确认迁移”继续").fill("确认迁移");
    await expect.element(confirmButton).toBeEnabled();
    await confirmButton.click();

    await expect.poll(() => mocks.confirm.mock.calls.length).toBe(1);
    expect(mocks.confirm).toHaveBeenCalledWith(jobId, fixture);
    await expect.element(screen.getByText("迁移已确认")).toBeVisible();
    await expect
      .element(screen.getByRole("button", { name: "放弃迁移" }))
      .not.toBeInTheDocument();
  });

  it("abandons a staged migration and unlocks file selection", async () => {
    const screen = await renderSection();
    await screen.getByLabelText("V1 迁移包").upload(migrationFile());
    await expect.poll(() => mocks.parseBundle.mock.calls.length).toBe(1);
    await screen.getByRole("button", { name: "上传并核对" }).click();
    await expect.poll(() => mocks.upload.mock.calls.length).toBe(1);

    await screen.getByRole("button", { name: "放弃迁移" }).click();

    await expect.poll(() => mocks.abandon.mock.calls.length).toBe(1);
    expect(mocks.confirm).not.toHaveBeenCalled();
    await expect
      .element(screen.getByText("核对通过，等待确认"))
      .not.toBeInTheDocument();
    await expect.element(screen.getByLabelText("V1 迁移包")).toBeEnabled();
  });

  it("recognizes a migration bundle that was already confirmed", async () => {
    mocks.upload.mockResolvedValue({
      job: { id: jobId, status: "confirmed" },
      reconciliation: null,
    });
    const screen = await renderSection();
    await screen.getByLabelText("V1 迁移包").upload(migrationFile());
    await expect.poll(() => mocks.parseBundle.mock.calls.length).toBe(1);

    await screen.getByRole("button", { name: "上传并核对" }).click();

    await expect.element(screen.getByText("迁移已确认")).toBeVisible();
    await expect.element(screen.getByLabelText("V1 迁移包")).toBeDisabled();
    await expect
      .element(screen.getByRole("button", { name: "放弃迁移" }))
      .not.toBeInTheDocument();
  });

  it("rejects oversized bundles before reading or parsing them", async () => {
    const screen = await renderSection();
    const file = migrationFile();
    Object.defineProperty(file, "size", { value: 100 * 1024 * 1024 + 1 });
    const input = document.querySelector<HTMLInputElement>(
      '#v1-migration-bundle',
    );
    expect(input).not.toBeNull();
    const transfer = new DataTransfer();
    transfer.items.add(file);
    Object.defineProperty(input, "files", {
      configurable: true,
      value: transfer.files,
    });

    input!.dispatchEvent(new Event("change", { bubbles: true }));

    await expect.poll(() => mocks.parseBundle.mock.calls.length).toBe(0);
    await expect
      .element(screen.getByRole("button", { name: "上传并核对" }))
      .toBeDisabled();
  });

  it("passes an abort signal and can stop an in-flight upload", async () => {
    mocks.upload.mockImplementation(
      (_bundle: V1MigrationBundle, options: { signal: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          options.signal.addEventListener(
            "abort",
            () =>
              reject(
                new ApiError({
                  code: API_ERROR_CODES.aborted,
                  message: "Request was aborted",
                }),
              ),
            { once: true },
          );
        }),
    );
    const screen = await renderSection();
    await screen.getByLabelText("V1 迁移包").upload(migrationFile());
    await expect.poll(() => mocks.parseBundle.mock.calls.length).toBe(1);
    await screen.getByRole("button", { name: "上传并核对" }).click();
    await expect.poll(() => mocks.upload.mock.calls.length).toBe(1);

    const signal = mocks.upload.mock.calls[0]?.[1]?.signal as AbortSignal;
    expect(signal.aborted).toBe(false);
    await screen.getByRole("button", { name: "停止上传" }).click();

    await expect.poll(() => signal.aborted).toBe(true);
    await expect
      .element(screen.getByRole("button", { name: "上传并核对" }))
      .toBeEnabled();
  });
});
