import type { BackupSnapshot } from "@dealpilot/api-client";
import { CoreAdminContext } from "ra-core";
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

vi.mock("../providers/apiClient", () => ({
  getCloudApiClient: () => ({
    backups: mocks,
  }),
}));

vi.mock("./encryptedCloudBackup", () => cryptoMocks);

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

const renderPage = () =>
  render(
    <CoreAdminContext
      dataProvider={fakeDataProvider({
        companies: [],
        contacts: [],
        social_accounts: [],
        deals: [],
        follow_ups: [],
        reminders: [],
        deal_risks: [],
        deal_milestones: [],
      })}
      i18nProvider={i18nProvider}
    >
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
