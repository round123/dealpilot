import { ImportFieldMappingSchema } from "@dealpilot/shared";

import { ApiError } from "../errors/api-error";

export type ImportFieldMapping = ReturnType<
  typeof ImportFieldMappingSchema.parse
>;

export function getImportSourceColumns(
  rows: Record<string, unknown>[],
): string[] {
  return Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
}

export function applyImportFieldMapping(
  rows: Record<string, unknown>[],
  mapping: ImportFieldMapping,
  sourceColumns = getImportSourceColumns(rows),
): Record<string, unknown>[] {
  if (sourceColumns.length > 0) {
    const columns = new Set(sourceColumns);
    const fields: Record<string, string[]> = {};
    for (const [target, source] of Object.entries(mapping)) {
      if (source && !columns.has(source)) {
        fields[`mapping.${target}`] = [
          `Source column '${source}' was not found`,
        ];
      }
    }
    if (Object.keys(fields).length > 0) throw ApiError.validation(fields);
  }

  return rows.map((row) => {
    const mapped: Record<string, unknown> = {};
    for (const [target, source] of Object.entries(mapping)) {
      if (source) mapped[target] = row[source];
    }
    return mapped;
  });
}
