/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, type ReactNode } from "react";
import type {
  BackupRestoreResponseSchema,
  BackupValidateResponseSchema,
  ClearLocalDataResponseSchema,
  LocalDataInfoSchema,
  RollingUsageMetricsSchema,
  Settings,
  SettingsUpdate,
} from "@dealpilot/shared";

export type BackupValidationResult = ReturnType<
  typeof BackupValidateResponseSchema.parse
>;
export type BackupRestoreResult = ReturnType<
  typeof BackupRestoreResponseSchema.parse
>;
export type LocalDataInfo = ReturnType<typeof LocalDataInfoSchema.parse>;
export type ClearLocalDataResult = ReturnType<
  typeof ClearLocalDataResponseSchema.parse
>;
export type RollingUsageMetrics = ReturnType<
  typeof RollingUsageMetricsSchema.parse
>;

export interface LocalDataOperations {
  createBackup(
    password: string,
    options?: { signal?: AbortSignal },
  ): Promise<Blob>;
  validateBackup(
    file: File,
    password: string,
    options?: { signal?: AbortSignal },
  ): Promise<BackupValidationResult>;
  restoreBackup(
    file: File,
    password: string,
    confirmation: string,
    options?: { signal?: AbortSignal; idempotencyKey?: string },
  ): Promise<BackupRestoreResult>;
  exportAll(options?: { signal?: AbortSignal }): Promise<Blob>;
  getUsageMetrics(options?: { signal?: AbortSignal }): Promise<RollingUsageMetrics>;
  exportUsageMetrics(options?: { signal?: AbortSignal }): Promise<Blob>;
  getInfo(options?: { signal?: AbortSignal }): Promise<LocalDataInfo>;
  getSettings(options?: { signal?: AbortSignal }): Promise<Settings>;
  updateSettings(
    input: SettingsUpdate,
    options?: { signal?: AbortSignal },
  ): Promise<Settings>;
  clearData(
    confirmation: string,
    options?: { signal?: AbortSignal; idempotencyKey?: string },
  ): Promise<ClearLocalDataResult>;
}

const LocalDataOperationsContext = createContext<LocalDataOperations | null>(null);

export function LocalDataOperationsProvider({
  children,
  operations,
}: {
  children: ReactNode;
  operations?: LocalDataOperations;
}) {
  return (
    <LocalDataOperationsContext.Provider value={operations ?? null}>
      {children}
    </LocalDataOperationsContext.Provider>
  );
}

export function useLocalDataOperations(): LocalDataOperations | null {
  return useContext(LocalDataOperationsContext);
}
