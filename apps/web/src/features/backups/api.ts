import { useMutation } from "@tanstack/react-query";
import { api, API_PATHS } from "@/lib/api-client";
import type { BackupValidateResponse, BackupRestoreResponse } from "@dealpilot/shared";

export function useBackupCreate() {
  return useMutation({
    mutationFn: (data: { password: string }) =>
      api.download(API_PATHS.backupsCreate, data),
  });
}

export function useBackupValidate() {
  return useMutation({
    mutationFn: ({ file, password }: { file: File; password: string }) => {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("password", password);
      return api.upload<BackupValidateResponse>(API_PATHS.backupsValidate, formData);
    },
  });
}

export function useBackupRestore() {
  return useMutation({
    mutationFn: ({ file, password }: { file: File; password: string }) => {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("password", password);
      return api.upload<BackupRestoreResponse>(API_PATHS.backupsRestore, formData);
    },
  });
}
