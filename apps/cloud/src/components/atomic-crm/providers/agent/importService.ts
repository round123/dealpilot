import {
  ImportCommitRequestSchema,
  ImportCommitResponseSchema,
  ImportParseRequestSchema,
  ImportParseResponseSchema,
} from "@dealpilot/shared";
import { API_ERROR_CODES, ApiError } from "@dealpilot/api-client";

import type { CustomerImportOperations } from "../importOperations";
import type { AgentClient } from "./client";

const csvBlobParser = {
  parse(value: unknown): Blob {
    if (
      !(value instanceof Blob) ||
      !value.type.toLowerCase().includes("text/csv")
    ) {
      throw new TypeError("Expected a CSV error report");
    }
    return value;
  },
};

export function createAgentImportOperations(
  client: AgentClient,
): CustomerImportOperations {
  return {
    async parseFile(file, options) {
      const request = parseParseRequest({ mapping: options?.mapping });
      const formData = new FormData();
      formData.set("file", file, file.name);
      if (request.mapping) {
        formData.set("mapping", JSON.stringify(request.mapping));
      }
      return client.postForm(
        "imports/parse",
        formData,
        ImportParseResponseSchema,
        { signal: options?.signal },
      );
    },

    async commit(input, options) {
      const request = parseCommitRequest(input);
      return client.post(
        `imports/${encodeURIComponent(request.job_id)}/commit`,
        request,
        ImportCommitResponseSchema,
        options,
      );
    },

    async downloadErrors(jobId, options) {
      const parsedJobId = parseJobId(jobId);
      return await client.getBlob(
        `imports/${encodeURIComponent(parsedJobId)}/errors`,
        csvBlobParser,
        options,
      );
    },
  };
}

function parseParseRequest(input: unknown) {
  const result = ImportParseRequestSchema.safeParse(input);
  if (result.success) return result.data;
  throw inputValidationError(result.error);
}

function parseCommitRequest(input: unknown) {
  const result = ImportCommitRequestSchema.safeParse(input);
  if (result.success) return result.data;
  throw inputValidationError(result.error);
}

function parseJobId(jobId: unknown): string {
  const result = ImportCommitRequestSchema.shape.job_id.safeParse(jobId);
  if (result.success) return result.data;
  throw inputValidationError(result.error);
}

function inputValidationError(error: {
  issues: ReadonlyArray<{ path: Array<string | number>; message: string }>;
}) {
  const fields: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const field = issue.path.join(".") || "request";
    (fields[field] ??= []).push(issue.message);
  }
  return new ApiError({
    code: API_ERROR_CODES.validation,
    message: "Invalid Local Agent import request",
    status: 400,
    fields,
    details: error.issues,
  });
}
