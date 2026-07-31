import { render } from "vitest-browser-react";
import type * as RaCore from "ra-core";

import { LocalDataOperationsProvider } from "../providers/localDataOperations";
import type { LocalDataOperations } from "../providers/localDataOperations";

const mocks = vi.hoisted(() => ({
  notify: vi.fn(),
  validateBackup: vi.fn(),
  restoreBackup: vi.fn(),
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
    };
    const screen = await render(
      <LocalDataOperationsProvider operations={operations}>
        <LocalDataToolsPage />
      </LocalDataOperationsProvider>,
    );

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
});

function setFileInput(input: HTMLInputElement, file: File) {
  const transfer = new DataTransfer();
  transfer.items.add(file);
  input.files = transfer.files;
  input.dispatchEvent(new Event("change", { bubbles: true }));
}
