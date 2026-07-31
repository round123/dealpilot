/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, type ReactNode } from "react";
import type {
  BackupRestoreResponseSchema,
  BackupValidateResponseSchema,
} from "@dealpilot/shared";

export type BackupValidationResult = ReturnType<
  typeof BackupValidateResponseSchema.parse
>;
export type BackupRestoreResult = ReturnType<
  typeof BackupRestoreResponseSchema.parse
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
