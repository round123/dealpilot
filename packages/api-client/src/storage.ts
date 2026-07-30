import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import {
  API_ERROR_CODES,
  ApiError,
  errorCodeForStatus,
  normalizeThrownError,
} from "./error.js";

const CurrentUserResultSchema = z.object({
  user: z.object({ id: z.string().uuid() }).nullable(),
});

const UploadResultSchema = z.object({
  path: z.string().min(1),
  fullPath: z.string().min(1).optional(),
});

const SignedUrlResultSchema = z.object({
  signedUrl: z.string().url(),
});

export type StorageUploadBody =
  | Blob
  | ArrayBuffer
  | ArrayBufferView
  | FormData
  | ReadableStream<Uint8Array>
  | string;

export interface StorageRequestOptions {
  signal?: AbortSignal;
}

export interface StorageUploadOptions extends StorageRequestOptions {
  cacheControl?: string;
  contentType?: string;
  upsert?: boolean;
}

export interface StorageTransformOptions {
  width?: number;
  height?: number;
  resize?: "cover" | "contain" | "fill";
  quality?: number;
  format?: "origin" | "avif";
}

export interface SignedUrlOptions extends StorageRequestOptions {
  download?: string | boolean;
  transform?: StorageTransformOptions;
  cacheNonce?: string;
}

export interface StoredObject {
  path: string;
}

export interface SignedStorageUrl {
  path: string;
  signedUrl: string;
  expiresIn: number;
}

export interface PrivateStorageApi {
  upload(
    bucket: string,
    relativePath: string,
    body: StorageUploadBody,
    options?: StorageUploadOptions,
  ): Promise<StoredObject>;
  remove(
    bucket: string,
    relativePaths: string | readonly string[],
    options?: StorageRequestOptions,
  ): Promise<void>;
  createSignedUrl(
    bucket: string,
    relativePath: string,
    expiresIn: number,
    options?: SignedUrlOptions,
  ): Promise<SignedStorageUrl>;
}

interface SupabaseErrorLike {
  message?: string;
  code?: string;
  error?: string;
  status?: number | string;
  statusCode?: number | string;
  name?: string;
  request_id?: string;
}

interface SupabaseResultLike {
  data: unknown;
  error: SupabaseErrorLike | null;
}

interface StorageBucketLike {
  upload(
    path: string,
    body: StorageUploadBody,
    options?: Record<string, unknown>,
  ): Promise<SupabaseResultLike>;
  remove(paths: string[]): Promise<SupabaseResultLike>;
  createSignedUrl(
    path: string,
    expiresIn: number,
    options?: Record<string, unknown>,
  ): Promise<SupabaseResultLike>;
}

interface StorageClientLike {
  auth: {
    getUser(): Promise<SupabaseResultLike>;
  };
  storage: {
    from(bucket: string): StorageBucketLike;
  };
}

function statusFromError(error: SupabaseErrorLike): number {
  const rawStatus = error.statusCode ?? error.status;
  const status =
    typeof rawStatus === "string" ? Number.parseInt(rawStatus, 10) : rawStatus;
  return typeof status === "number" && Number.isFinite(status) ? status : 0;
}

function normalizeSupabaseError(error: SupabaseErrorLike): ApiError {
  const status = statusFromError(error);
  return new ApiError({
    code:
      error.code ||
      error.error ||
      (status === 0 ? API_ERROR_CODES.storage : errorCodeForStatus(status)),
    message: error.message || error.error || "Storage request failed",
    status,
    requestId: error.request_id,
    details: { storageErrorName: error.name },
    cause: error,
  });
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw normalizeThrownError(signal.reason, signal);
}

async function executeSupabase(
  request: () => Promise<SupabaseResultLike>,
  signal?: AbortSignal,
): Promise<unknown> {
  throwIfAborted(signal);
  try {
    const result = await request();
    throwIfAborted(signal);
    if (typeof result !== "object" || result === null || !("error" in result)) {
      throw new ApiError({
        code: API_ERROR_CODES.invalidResponse,
        message: "Supabase returned an invalid response",
        details: result,
      });
    }
    if (result.error !== null) throw normalizeSupabaseError(result.error);
    if (!Object.prototype.hasOwnProperty.call(result, "data")) {
      throw new ApiError({
        code: API_ERROR_CODES.invalidResponse,
        message: "Supabase response did not contain data",
      });
    }
    return result.data;
  } catch (error) {
    throw normalizeThrownError(error, signal);
  }
}

function parseAtBoundary<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (parsed.success) return parsed.data;
  throw new ApiError({
    code: API_ERROR_CODES.invalidResponse,
    message: "Storage response did not match the expected contract",
    details: parsed.error.issues,
    cause: parsed.error,
  });
}

function invalidPath(message: string): ApiError {
  return new ApiError({
    code: API_ERROR_CODES.validation,
    message,
    fields: { path: [message] },
  });
}

function assertBucket(bucket: string): void {
  if (/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(bucket)) return;
  throw new ApiError({
    code: API_ERROR_CODES.validation,
    message: "Storage bucket name is invalid",
    fields: {
      bucket: [
        "Must contain only letters, numbers, dots, underscores, or hyphens",
      ],
    },
  });
}

function ownerPath(userId: string, relativePath: string): string {
  if (
    relativePath.length === 0 ||
    relativePath !== relativePath.trim() ||
    relativePath.startsWith("/") ||
    relativePath.endsWith("/") ||
    relativePath.includes("\\") ||
    /[\u0000-\u001f\u007f]/.test(relativePath)
  ) {
    throw invalidPath("Storage path must be a non-empty relative object path");
  }

  for (const segment of relativePath.split("/")) {
    let decoded: string;
    try {
      decoded = decodeURIComponent(segment);
    } catch {
      throw invalidPath("Storage path contains invalid URL encoding");
    }
    if (
      segment.length === 0 ||
      decoded === "." ||
      decoded === ".." ||
      decoded.includes("/") ||
      decoded.includes("\\")
    ) {
      throw invalidPath("Storage path contains an unsafe segment");
    }
  }

  return `${userId}/${relativePath}`;
}

function assertRelativePath(relativePath: string): void {
  ownerPath("owner", relativePath);
}

function assertExpiresIn(expiresIn: number): void {
  if (Number.isInteger(expiresIn) && expiresIn > 0) return;
  throw new ApiError({
    code: API_ERROR_CODES.validation,
    message: "Signed URL expiry must be a positive integer",
    fields: { expiresIn: ["Must be a positive integer number of seconds"] },
  });
}

export function createPrivateStorageApi(
  client: SupabaseClient,
): PrivateStorageApi {
  const supabase = client as unknown as StorageClientLike;

  const currentUserId = async (signal?: AbortSignal): Promise<string> => {
    const data = await executeSupabase(() => supabase.auth.getUser(), signal);
    const parsed = parseAtBoundary(CurrentUserResultSchema, data);
    if (parsed.user === null) {
      throw new ApiError({
        code: API_ERROR_CODES.unauthorized,
        message: "An authenticated user is required for storage access",
        status: 401,
      });
    }
    return parsed.user.id;
  };

  return {
    async upload(bucket, relativePath, body, options = {}) {
      assertBucket(bucket);
      assertRelativePath(relativePath);
      const path = ownerPath(await currentUserId(options.signal), relativePath);
      const data = await executeSupabase(
        () =>
          supabase.storage.from(bucket).upload(path, body, {
            cacheControl: options.cacheControl,
            contentType: options.contentType,
            upsert: options.upsert,
          }),
        options.signal,
      );
      const uploaded = parseAtBoundary(UploadResultSchema, data);
      if (uploaded.path !== path) {
        throw new ApiError({
          code: API_ERROR_CODES.invalidResponse,
          message: "Storage returned an object outside the current user prefix",
          details: { expectedPath: path, actualPath: uploaded.path },
        });
      }
      return { path: uploaded.path };
    },

    async remove(bucket, relativePaths, options = {}) {
      assertBucket(bucket);
      const paths =
        typeof relativePaths === "string"
          ? [relativePaths]
          : [...relativePaths];
      if (paths.length === 0)
        throw invalidPath("At least one storage path is required");
      paths.forEach(assertRelativePath);
      const userId = await currentUserId(options.signal);
      const ownerPaths = paths.map((path) => ownerPath(userId, path));
      const data = await executeSupabase(
        () => supabase.storage.from(bucket).remove(ownerPaths),
        options.signal,
      );
      parseAtBoundary(z.array(z.unknown()), data);
    },

    async createSignedUrl(bucket, relativePath, expiresIn, options = {}) {
      assertBucket(bucket);
      assertExpiresIn(expiresIn);
      assertRelativePath(relativePath);
      const path = ownerPath(await currentUserId(options.signal), relativePath);
      const data = await executeSupabase(
        () =>
          supabase.storage.from(bucket).createSignedUrl(path, expiresIn, {
            download: options.download,
            transform: options.transform,
            cacheNonce: options.cacheNonce,
          }),
        options.signal,
      );
      const signed = parseAtBoundary(SignedUrlResultSchema, data);
      return { path, signedUrl: signed.signedUrl, expiresIn };
    },
  };
}
