import { createContext, useContext, type ReactNode } from "react";
import type {
  ImportCommitRequestSchema,
  ImportCommitResponseSchema,
  ImportFieldMappingSchema,
  ImportParseResponseSchema,
} from "@dealpilot/shared";

export type ImportParseResult = ReturnType<
  typeof ImportParseResponseSchema.parse
>;
export type ImportCommitInput = ReturnType<
  typeof ImportCommitRequestSchema.parse
>;
export type ImportCommitResult = ReturnType<
  typeof ImportCommitResponseSchema.parse
>;
export type ImportFieldMapping = ReturnType<
  typeof ImportFieldMappingSchema.parse
>;

export interface CustomerImportOperations {
  parseFile(
    file: File,
    options?: { signal?: AbortSignal; mapping?: ImportFieldMapping },
  ): Promise<ImportParseResult>;
  commit(
    input: ImportCommitInput,
    options?: { signal?: AbortSignal; idempotencyKey?: string },
  ): Promise<ImportCommitResult>;
  downloadErrors(
    jobId: string,
    options?: { signal?: AbortSignal },
  ): Promise<Blob>;
}

const ImportOperationsContext = createContext<CustomerImportOperations | null>(
  null,
);

export function ImportOperationsProvider({
  children,
  operations,
}: {
  children: ReactNode;
  operations?: CustomerImportOperations;
}) {
  return (
    <ImportOperationsContext.Provider value={operations ?? null}>
      {children}
    </ImportOperationsContext.Provider>
  );
}

// Provider and hook intentionally share the same private capability context.
// eslint-disable-next-line react-refresh/only-export-components
export function useImportOperations(): CustomerImportOperations | null {
  return useContext(ImportOperationsContext);
}
