import type { SettingsUpdate } from "@dealpilot/shared";
import { getOrCreateSettings, updateSettingsRecord } from "../repositories/system-repository";

export function getSettings() {
  return getOrCreateSettings();
}

export function updateSettings(input: SettingsUpdate) {
  return updateSettingsRecord(input);
}
