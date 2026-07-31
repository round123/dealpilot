import type { SettingsUpdate } from "@dealpilot/shared";
import { ApiError } from "../errors/api-error";
import { setAutoStartEnabled } from "../platform/auto-start";
import { getOrCreateSettings, updateSettingsRecord } from "../repositories/system-repository";

export function getSettings() {
  return getOrCreateSettings();
}

export function updateSettings(
  input: SettingsUpdate,
  applyAutoStart: (enabled: boolean) => void = setAutoStartEnabled,
) {
  if (input.auto_start !== undefined) {
    try {
      applyAutoStart(input.auto_start);
    } catch (error) {
      throw ApiError.badRequest(
        error instanceof Error ? error.message : "Unable to update auto-start",
      );
    }
  }
  return updateSettingsRecord(input);
}
