import { zValidator } from "@hono/zod-validator";
import type { Context } from "hono";
import type { ZodError, ZodTypeAny } from "zod";
import type { AppEnv } from "../types/hono";

export function validateJson<T extends ZodTypeAny>(schema: T) {
  return zValidator("json", schema, (result, c) => {
    if (result.success) return;
    return validationErrorResponse(result.error, c as Context<AppEnv>);
  });
}

export function validateQuery<T extends ZodTypeAny>(schema: T) {
  return zValidator("query", schema, (result, c) => {
    if (result.success) return;
    return validationErrorResponse(result.error, c as Context<AppEnv>);
  });
}

function validationErrorResponse(error: ZodError, c: Context<AppEnv>) {
  const fields: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const field = issue.path.length > 0 ? issue.path.join(".") : "_root";
    (fields[field] ??= []).push(issue.message);
  }

  return c.json(
    {
      error: {
        code: "VALIDATION_ERROR",
        message: "Request validation failed",
        fields,
        request_id: c.get("requestId") ?? undefined,
      },
    },
    400,
  );
}
