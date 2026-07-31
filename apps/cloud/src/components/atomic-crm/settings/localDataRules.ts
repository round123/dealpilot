import type { BackupValidationResult } from "../providers/localDataOperations";

export function canRestoreValidatedBackup(
  validation: BackupValidationResult | null,
): boolean {
  return validation?.valid === true && validation.integrity_ok === true;
}
