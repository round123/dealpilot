import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import type { ClearLocalData } from "@dealpilot/shared";
import { config } from "../config/config";
import { ApiError } from "../errors/api-error";
import { isPackagedAgent, setAutoStartEnabled } from "../platform/auto-start";
import { getLocalDataState } from "../repositories/system-repository";
import { resetLocalDatabase } from "../repositories/backup-repository";

export async function getLocalDataInfo(now: Date = new Date()) {
  const state = await getLocalDataState();
  const reminderDays = state.settings.backup_reminder_days ?? 7;
  const anchor = state.settings.last_backup_at ?? state.oldestCreatedAt;
  const overdue = anchor
    ? now.getTime() - new Date(anchor).getTime() >= reminderDays * 86_400_000
    : false;
  const backupRecommendation = !state.businessCount
    ? "not_needed"
    : state.committedImportCount > 0 && !state.settings.last_backup_at
      ? "first_import"
      : overdue
        ? "overdue"
        : "current";

  return {
    data_path: config.dbPath,
    database_size_bytes: fileSize(config.dbPath),
    occupied_size_bytes:
      fileSize(config.dbPath) +
      fileSize(`${config.dbPath}-wal`) +
      fileSize(`${config.dbPath}-shm`),
    recovery_size_bytes: directorySize(join(config.dataDir, "recovery")),
    last_backup_at: state.settings.last_backup_at,
    backup_reminder_days: reminderDays,
    backup_recommendation: backupRecommendation,
    has_business_data: state.businessCount > 0,
    auto_start_supported: process.platform === "win32" && isPackagedAgent(),
  } as const;
}

export async function clearLocalData(
  input: ClearLocalData,
  applyAutoStart: (enabled: boolean) => void = setAutoStartEnabled,
) {
  if (input.confirmation !== "CLEAR ALL DATA") {
    throw ApiError.validation({
      confirmation: ["请输入 CLEAR ALL DATA 确认清空"],
    });
  }
  const { settings } = await getLocalDataState();
  const shouldDisableAutoStart = settings.auto_start;
  const deletedRecords = resetLocalDatabase({
    beforeDeleteOldDatabase: shouldDisableAutoStart
      ? () => applyAutoStart(false)
      : undefined,
    afterRollback: shouldDisableAutoStart
      ? () => applyAutoStart(true)
      : undefined,
  });
  return {
    success: true as const,
    deleted_records: deletedRecords,
    cleared_at: new Date().toISOString(),
    external_backups_preserved: true as const,
  };
}

function fileSize(path: string): number {
  return existsSync(path) ? statSync(path).size : 0;
}

function directorySize(path: string): number {
  if (!existsSync(path)) return 0;
  return readdirSync(path, { withFileTypes: true }).reduce((total, entry) => {
    const entryPath = join(path, entry.name);
    return (
      total +
      (entry.isDirectory() ? directorySize(entryPath) : fileSize(entryPath))
    );
  }, 0);
}
