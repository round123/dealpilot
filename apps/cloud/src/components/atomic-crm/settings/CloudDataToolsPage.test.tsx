import {
  API_ERROR_CODES,
  ApiError,
  type BackupSnapshot,
} from "@dealpilot/api-client";
import { CoreAdminContext, type DataProvider } from "ra-core";
import fakeDataProvider from "ra-data-fakerest";
import { render } from "vitest-browser-react";

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  create: vi.fn(),
  restore: vi.fn(),
  exportPayload: vi.fn(),
  restorePayload: vi.fn(),
}));

const cryptoMocks = vi.hoisted(() => ({
  createEncryptedBackupArchive: vi.fn(),
  inspectEncryptedBackupArchive: vi.fn(),
}));

const xlsxMocks = vi.hoisted(() => ({
  writeFile: vi.fn(),
}));

const uiMocks = vi.hoisted(() => ({
  notify: vi.fn(),
}));

vi.mock("ra-core", async (importOriginal) => ({
  // eslint-disable-next-line @typescript-eslint/consistent-type-imports
  ...(await importOriginal<typeof import("ra-core")>()),
  useNotify: () => uiMocks.notify,
}));

vi.mock("../providers/apiClient", () => ({
  getCloudApiClient: () => ({
    backups: mocks,
  }),
}));

vi.mock("./encryptedCloudBackup", () => cryptoMocks);

vi.mock("xlsx", async (importOriginal) => ({
  // eslint-disable-next-line @typescript-eslint/consistent-type-imports
  ...(await importOriginal<typeof import("xlsx")>()),
  writeFile: xlsxMocks.writeFile,
}));

import { CloudDataToolsPage } from "./CloudDataToolsPage";

const snapshot: BackupSnapshot = {
  id: "11111111-1111-4111-8111-111111111111",
  label: "手动备份",
  schema_version: 1,
  checksum: "a".repeat(64),
  created_at: "2026-07-31T08:00:00.000Z",
  row_counts: { companies: 3, contacts: 5 },
};

const exported = {
  id: snapshot.id,
  schema_version: 1 as const,
  checksum: snapshot.checksum,
  created_at: snapshot.created_at,
  row_counts: snapshot.row_counts!,
  payload: { schema_version: 1 },
};

const inspectedBackup = {
  snapshotId: snapshot.id,
  createdAt: snapshot.created_at,
  rowCounts: snapshot.row_counts!,
  restoreInput: {
    schemaVersion: 1 as const,
    checksum: snapshot.checksum,
    payload: exported.payload,
  },
};

const i18nProvider = {
  translate: (key: string, options?: { _?: unknown }) =>
    typeof options?._ === "string" ? options._ : key,
  changeLocale: () => Promise.resolve(),
  getLocale: () => "zh-CN",
};

const exportResources = [
  "companies",
  "contacts",
  "social_accounts",
  "deals",
  "follow_ups",
  "reminders",
  "deal_risks",
  "deal_milestones",
];

const createFakeDataProvider = () =>
  fakeDataProvider({
    companies: [],
    contacts: [],
    social_accounts: [],
    deals: [],
    follow_ups: [],
    reminders: [],
    deal_risks: [],
    deal_milestones: [],
  });

const renderPage = (dataProvider: DataProvider = createFakeDataProvider()) =>
  render(
    <CoreAdminContext dataProvider={dataProvider} i18nProvider={i18nProvider}>
      <CloudDataToolsPage />
    </CoreAdminContext>,
  );

describe("CloudDataToolsPage", () => {
  beforeEach(() => {
    mocks.list.mockReset().mockResolvedValue({ data: [snapshot], total: 1 });
    mocks.create.mockReset().mockResolvedValue(snapshot);
    mocks.restore.mockReset().mockResolvedValue({
      id: snapshot.id,
      checksum: snapshot.checksum,
      restored_counts: snapshot.row_counts,
    });
    mocks.exportPayload.mockReset().mockResolvedValue(exported);
    mocks.restorePayload.mockReset().mockResolvedValue({
      id: snapshot.id,
      checksum: snapshot.checksum,
      restored_counts: snapshot.row_counts,
    });
    cryptoMocks.createEncryptedBackupArchive
      .mockReset()
      .mockResolvedValue(new Blob(["encrypted"]));
    cryptoMocks.inspectEncryptedBackupArchive.mockReset();
    xlsxMocks.writeFile.mockReset();
    uiMocks.notify.mockReset();
  });

  it("loads snapshot metadata and creates a cloud backup", async () => {
    const screen = await renderPage();

    await expect.element(screen.getByText("手动备份")).toBeVisible();
    await expect.element(screen.getByText(/8 条业务记录/)).toBeVisible();
    expect(mocks.list).toHaveBeenCalledWith(
      expect.objectContaining({
        pagination: { page: 1, perPage: 20 },
        sort: { field: "created_at", order: "desc" },
        signal: expect.any(AbortSignal),
      }),
    );

    await screen.getByRole("button", { name: "创建云端备份" }).click();
    await expect.poll(() => mocks.create.mock.calls.length).toBe(1);
    expect(mocks.create).toHaveBeenCalledWith({ label: "手动备份" });
  });

  it("loads all standard export resources with one bounded abort signal", async () => {
    const dataProvider = createFakeDataProvider();
    const releases: Array<() => void> = [];
    const getList = vi
      .spyOn(dataProvider, "getList")
      .mockImplementation(
        () =>
          new Promise((resolve) =>
            releases.push(() => resolve({ data: [], total: 0 })),
          ),
      );
    const screen = await renderPage(dataProvider);

    await screen.getByRole("button", { name: "导出 Excel" }).click();
    await expect
      .poll(
        () =>
          getList.mock.calls.filter(([resource]) =>
            exportResources.includes(resource),
          ).length,
      )
      .toBe(exportResources.length);

    const exportCalls = getList.mock.calls.filter(([resource]) =>
      exportResources.includes(resource),
    );
    expect(exportCalls.map(([resource]) => resource).sort()).toEqual(
      [...exportResources].sort(),
    );
    const signals = exportCalls.map(([, params]) => params.signal);
    expect(signals.every((signal) => signal instanceof AbortSignal)).toBe(true);
    expect(new Set(signals).size).toBe(1);
    releases.forEach((release) => release());
    await expect
      .element(screen.getByRole("button", { name: "导出 Excel" }))
      .toBeEnabled();
    expect(xlsxMocks.writeFile).toHaveBeenCalledOnce();
  });

  it("maps the 30 second abort deadline to a Chinese timeout notification", async () => {
    const dataProvider = createFakeDataProvider();
    const nativeSetTimeout = window.setTimeout.bind(window);
    const timeout = vi
      .spyOn(window, "setTimeout")
      .mockImplementation((handler, delay) => {
        if (delay === 30_000) {
          queueMicrotask(() => handler());
          return 30_000 as unknown as ReturnType<typeof setTimeout>;
        }
        return nativeSetTimeout(handler, delay) as unknown as ReturnType<
          typeof window.setTimeout
        >;
      });
    const getList = vi
      .spyOn(dataProvider, "getList")
      .mockImplementation((_resource, params) => {
        const signal = params.signal!;
        return new Promise((_resolve, reject) => {
          signal.addEventListener(
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
        });
      });

    try {
      const screen = await renderPage(dataProvider);
      await screen.getByRole("button", { name: "导出 Excel" }).click();
      await expect.poll(() => uiMocks.notify.mock.calls.length).toBe(1);
      expect(uiMocks.notify).toHaveBeenCalledWith(
        "云端数据导出超时，请检查网络后重试",
        { type: "error" },
      );
      expect(getList).toHaveBeenCalledTimes(exportResources.length);
      expect(
        getList.mock.calls.every(([, params]) => params.signal?.aborted),
      ).toBe(true);
      expect(xlsxMocks.writeFile).not.toHaveBeenCalled();
    } finally {
      timeout.mockRestore();
    }
  });

  it("rejects exports over 10000 rows without creating a download", async () => {
    const dataProvider = createFakeDataProvider();
    const getList = vi
      .spyOn(dataProvider, "getList")
      .mockImplementation(async (resource) => ({
        data: [],
        total: resource === "companies" ? 10_001 : 0,
      }));
    const screen = await renderPage(dataProvider);

    await screen.getByRole("button", { name: "导出 Excel" }).click();
    await expect.poll(() => uiMocks.notify.mock.calls.length).toBe(1);
    expect(uiMocks.notify).toHaveBeenCalledWith(
      "客户数据超过 10000 条，请联系管理员执行分批导出",
      { type: "error" },
    );
    expect(getList).toHaveBeenCalledTimes(exportResources.length);
    expect(xlsxMocks.writeFile).not.toHaveBeenCalled();
  });

  it("requires explicit confirmation before restoring a snapshot", async () => {
    const screen = await renderPage();

    await expect.element(screen.getByText("手动备份")).toBeVisible();
    await screen.getByRole("button", { name: "恢复", exact: true }).click();
    const confirmButton = screen.getByRole("button", { name: "确认恢复" });
    await expect.element(confirmButton).toBeDisabled();

    await screen.getByLabelText("输入“恢复备份”继续").fill("恢复备份");
    await expect.element(confirmButton).toBeEnabled();
    expect(mocks.restore).not.toHaveBeenCalled();
  });

  it("requires matching passwords and exports only through the backup API", async () => {
    const screen = await renderPage();
    const exportButton = screen.getByRole("button", {
      name: "创建并下载加密备份",
    });
    await expect.element(exportButton).toBeDisabled();

    await screen
      .getByLabelText("备份密码", { exact: true })
      .fill("cloud-secret");
    await expect.element(exportButton).toBeDisabled();
    await screen
      .getByLabelText("确认备份密码", { exact: true })
      .fill("cloud-secret");
    await expect.element(exportButton).toBeEnabled();
    await exportButton.click();

    await expect.poll(() => mocks.exportPayload.mock.calls.length).toBe(1);
    expect(mocks.create).toHaveBeenCalledWith({ label: "加密文件备份" });
    expect(mocks.exportPayload).toHaveBeenCalledWith(snapshot.id);
    expect(cryptoMocks.createEncryptedBackupArchive).toHaveBeenCalledWith(
      exported,
      "cloud-secret",
    );
    expect(mocks.restorePayload).not.toHaveBeenCalled();
  });

  it("preflights an encrypted file and requires the restore phrase", async () => {
    cryptoMocks.inspectEncryptedBackupArchive.mockResolvedValue(
      inspectedBackup,
    );
    mocks.restorePayload.mockImplementation(() => new Promise(() => {}));
    const screen = await renderPage();
    const file = new File(["encrypted"], "backup.dpcloud", {
      type: "application/vnd.dealpilot.cloud-backup+json",
    });

    await screen
      .getByRole("button", { name: "加密备份文件", exact: true })
      .upload(file);
    await screen
      .getByLabelText("文件密码", { exact: true })
      .fill("cloud-secret");
    await screen.getByRole("button", { name: "预检备份" }).click();
    await expect
      .poll(() => cryptoMocks.inspectEncryptedBackupArchive.mock.calls.length)
      .toBe(1);
    expect(cryptoMocks.inspectEncryptedBackupArchive).toHaveBeenCalledWith(
      expect.any(File),
      "cloud-secret",
    );

    await screen
      .getByRole("button", { name: "恢复加密备份", exact: true })
      .click();
    const confirmButton = screen.getByRole("button", {
      name: "确认恢复",
      exact: true,
    });
    await expect.element(confirmButton).toBeDisabled();
    await screen.getByLabelText("输入“恢复加密备份”继续").fill("恢复加密备份");
    await expect.element(confirmButton).toBeEnabled();
    await confirmButton.click();
    await expect.poll(() => mocks.restorePayload.mock.calls.length).toBe(1);
    expect(mocks.restorePayload).toHaveBeenCalledWith(
      inspectedBackup.restoreInput,
    );
  });
});
