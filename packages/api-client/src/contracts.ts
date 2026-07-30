import { z } from "zod";
import { ApiError, API_ERROR_CODES, type FieldErrors } from "./error.js";

const FieldErrorsSchema = z.record(z.union([z.string(), z.array(z.string())]));

const ErrorBodySchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1),
  fields: FieldErrorsSchema.optional(),
  request_id: z.string().min(1).optional(),
});

const ErrorEnvelopeSchema = z.object({
  error: ErrorBodySchema,
});

type WireApiErrorBody = z.infer<typeof ErrorBodySchema>;

const SuccessEnvelopeSchema = z
  .object({
    data: z.unknown(),
  })
  .refine((value) => Object.prototype.hasOwnProperty.call(value, "data"), {
    message: "Missing data property",
  });

export interface ApiErrorBody {
  code: string;
  message: string;
  fields?: Record<string, string | string[]>;
  request_id: string;
}

export interface ApiSuccessEnvelope<T> {
  data: T;
}

export interface ApiErrorEnvelope {
  error: ApiErrorBody;
}

export type ApiEnvelope<T> = ApiSuccessEnvelope<T> | ApiErrorEnvelope;

export function normalizeFieldErrors(
  fields?: Readonly<Record<string, string | readonly string[]>>,
): FieldErrors | undefined {
  if (fields === undefined) return undefined;

  return Object.fromEntries(
    Object.entries(fields).map(([field, messages]) => [
      field,
      typeof messages === "string" ? [messages] : [...messages],
    ]),
  );
}

export interface ParseDataContext {
  status?: number;
  requestId?: string;
}

export function parseData<T>(
  schema: z.ZodType<T>,
  value: unknown,
  context: ParseDataContext = {},
): T {
  const parsed = schema.safeParse(value);
  if (parsed.success) return parsed.data;

  throw new ApiError({
    code: API_ERROR_CODES.invalidResponse,
    message: "Response did not match the expected contract",
    status: context.status,
    requestId: context.requestId,
    details: parsed.error.issues,
    cause: parsed.error,
  });
}

export function parseSuccessEnvelope<T>(
  schema: z.ZodType<T>,
  value: unknown,
  context: ParseDataContext = { status: 200 },
): T {
  const envelope = SuccessEnvelopeSchema.safeParse(value);
  if (!envelope.success) {
    const errorEnvelope = ErrorEnvelopeSchema.safeParse(value);
    if (errorEnvelope.success) {
      throw apiErrorFromBody(
        errorEnvelope.data.error,
        context.status ?? 200,
        context.requestId,
      );
    }

    throw new ApiError({
      code: API_ERROR_CODES.invalidResponse,
      message: "Response did not contain a valid data envelope",
      status: context.status,
      requestId: context.requestId,
      details: envelope.error.issues,
      cause: envelope.error,
    });
  }

  return parseData(schema, envelope.data.data, context);
}

export function parseErrorEnvelope(
  value: unknown,
): WireApiErrorBody | undefined {
  const parsed = ErrorEnvelopeSchema.safeParse(value);
  return parsed.success ? parsed.data.error : undefined;
}

export function apiErrorFromBody(
  body: WireApiErrorBody,
  status: number,
  fallbackRequestId?: string,
): ApiError {
  return new ApiError({
    code: body.code,
    message: body.message,
    status,
    fields: normalizeFieldErrors(body.fields),
    requestId: body.request_id ?? fallbackRequestId,
  });
}
