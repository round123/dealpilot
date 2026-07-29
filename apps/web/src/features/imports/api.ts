import { useMutation } from "@tanstack/react-query";
import { api, API_PATHS } from "@/lib/api-client";
import type { ImportParseResponse, ImportCommitResponse } from "@dealpilot/shared";

export function useImportParse() {
  return useMutation({
    mutationFn: (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      return api.upload<ImportParseResponse>(API_PATHS.importsParse, formData);
    },
  });
}

export function useImportCommit() {
  return useMutation({
    mutationFn: ({
      jobId,
      resolutions = [],
    }: {
      jobId: string;
      resolutions?: { row_index: number; action: "merge" | "skip" | "new"; target_customer_id?: string }[];
    }) =>
      api.post<ImportCommitResponse>(API_PATHS.importCommit(jobId), {
        job_id: jobId,
        resolutions,
      }, { idempotent: true }),
  });
}

export function useDownloadErrors(jobId: string) {
  return useMutation({
    mutationFn: () =>
      api.download(API_PATHS.importErrors(jobId)),
  });
}
