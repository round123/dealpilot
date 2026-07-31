import { API_ERROR_CODES, ApiError } from "@dealpilot/api-client";
import {
  BackupCreateSchema,
  BackupRestoreResponseSchema,
  BackupValidateResponseSchema,
  ClearLocalDataResponseSchema,
  ClearLocalDataSchema,
  LocalDataInfoSchema,
  StatsSchema,
  SettingsSchema,
  SettingsUpdateSchema,
} from "@dealpilot/shared";

import type { LocalDataOperations } from "../localDataOperations";
import type { AgentClient } from "./client";

const backupBlobParser = blobParser("application/octet-stream", "DealPilot backup");
const excelBlobParser = blobParser(
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "Excel workbook",
);
const jsonBlobParser = blobParser("application/json", "anonymized metrics report");

export function createAgentLocalDataOperations(
  client: AgentClient,
): LocalDataOperations {
  return {
    async createBackup(password, options) {
      const body = parseBackupPassword(password);
      return await client.post("backups/create", body, backupBlobParser, {
        ...options,
        responseType: "blob",
      });
    },

    async validateBackup(file, password, options) {
      assertBackupFile(file);
      parseBackupPassword(password);
      return await client.postForm(
        "backups/validate",
        backupForm(file, password),
        BackupValidateResponseSchema,
        options,
      );
    },

    async restoreBackup(file, password, confirmation, options) {
      assertBackupFile(file);
      parseBackupPassword(password);
      if (confirmation !== "RESTORE") {
        throw new ApiError({
          code: API_ERROR_CODES.validation,
          message: "Restore confirmation is required",
          status: 400,
          fields: { confirmation: ["请输入 RESTORE 确认恢复"] },
        });
      }
      return await client.postForm(
        "backups/restore",
        backupForm(file, password),
        BackupRestoreResponseSchema,
        options,
      );
    },

    async exportAll(options) {
      return await client.post("exports/all", {}, excelBlobParser, {
        ...options,
        responseType: "blob",
      });
    },

    async getUsageMetrics(options) {
      const stats = await client.get("stats", StatsSchema, options);
      return stats.rolling_30_days;
    },

    async exportUsageMetrics(options) {
      return await client.getBlob("stats/export", jsonBlobParser, options);
    },

    async getInfo(options) {
      return await client.get("system/local-data", LocalDataInfoSchema, options);
    },

    async getSettings(options) {
      return await client.get("settings", SettingsSchema, options);
    },

    async updateSettings(input, options) {
      const body = SettingsUpdateSchema.parse(input);
      return await client.put("settings", body, SettingsSchema, options);
    },

    async clearData(confirmation, options) {
      const parsed = ClearLocalDataSchema.safeParse({ confirmation });
      if (!parsed.success) {
        throw validationError({
          confirmation: ["请输入 CLEAR ALL DATA 确认清空"],
        });
      }
      return await client.post(
        "system/local-data/clear",
        parsed.data,
        ClearLocalDataResponseSchema,
        options,
      );
    },
  };
}

function backupForm(file: File, password: string) {
  const formData = new FormData();
  formData.set("file", file, file.name);
  formData.set("password", password);
  return formData;
}

function parseBackupPassword(password: string) {
  const result = BackupCreateSchema.safeParse({ password });
  if (result.success) return result.data;
  throw validationError({
    password: result.error.issues.map((issue) => issue.message),
  });
}

function assertBackupFile(file: File) {
  if (!(file instanceof File) || file.size === 0) {
    throw validationError({ file: ["请选择非空的 DealPilot 备份文件"] });
  }
}

function validationError(fields: Record<string, string[]>) {
  return new ApiError({
    code: API_ERROR_CODES.validation,
    message: "Invalid local data operation input",
    status: 400,
    fields,
  });
}

function blobParser(expectedType: string, name: string) {
  return {
    parse(value: unknown): Blob {
      if (
        !(value instanceof Blob) ||
        value.size === 0 ||
        !value.type.toLowerCase().includes(expectedType)
      ) {
        throw new TypeError(`Expected ${name}`);
      }
      return value;
    },
  };
}
