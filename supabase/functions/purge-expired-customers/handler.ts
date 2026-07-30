import { hasServiceRole } from "./auth.ts";

type PurgeJob = {
  id: string;
  object_paths: string[];
};

type RpcError = {
  code?: string;
  message?: string;
};

type RpcResult = {
  data: unknown;
  error: RpcError | null;
};

export type PurgeClient = {
  rpc: (
    name: string,
    parameters: Record<string, unknown>,
  ) => Promise<RpcResult>;
  storage: {
    from: (bucket: string) => {
      remove: (paths: string[]) => Promise<{ error: RpcError | null }>;
    };
  };
};

export type PurgeHandlerDependencies = {
  createClient: (url: string, serviceRoleKey: string) => PurgeClient;
  getEnvironment: (name: string) => string | undefined;
  randomUUID?: () => string;
  now?: () => number;
  logError?: (message: string, details: Record<string, unknown>) => void;
};

class RequestInputError extends Error {}

const jsonResponse = (
  status: number,
  body: Record<string, unknown>,
  requestId: string,
) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "x-request-id": requestId,
    },
  });

const errorResponse = (
  status: number,
  code: string,
  message: string,
  requestId: string,
) =>
  jsonResponse(
    status,
    { error: { code, message, request_id: requestId } },
    requestId,
  );

const readBody = async (request: Request): Promise<Record<string, unknown>> => {
  const rawBody = await request.text();
  if (!rawBody.trim()) return {};

  try {
    const value = JSON.parse(rawBody) as unknown;
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new RequestInputError("Request body must be a JSON object");
    }
    return value as Record<string, unknown>;
  } catch (error) {
    if (error instanceof RequestInputError) throw error;
    throw new RequestInputError("Request body must be valid JSON");
  }
};

const readPositiveInteger = (
  value: unknown,
  fallback: number,
  maximum: number,
) => {
  if (value === undefined) return fallback;
  if (
    !Number.isInteger(value) ||
    Number(value) < 1 ||
    Number(value) > maximum
  ) {
    throw new RequestInputError(`Expected an integer between 1 and ${maximum}`);
  }
  return Number(value);
};

const readCutoff = (value: unknown, now: number) => {
  if (value === undefined) {
    return new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString();
  }
  if (typeof value !== "string") {
    throw new RequestInputError("cutoff must be a valid timestamp");
  }

  const cutoff = new Date(value);
  if (Number.isNaN(cutoff.getTime())) {
    throw new RequestInputError("cutoff must be a valid timestamp");
  }
  return cutoff.toISOString();
};

const chunksOf = <T>(items: T[], size: number): T[][] => {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
};

export const createPurgeHandler = (dependencies: PurgeHandlerDependencies) => {
  const randomUUID = dependencies.randomUUID ?? (() => crypto.randomUUID());
  const now = dependencies.now ?? (() => Date.now());
  const logError = dependencies.logError ?? console.error;

  return async (request: Request): Promise<Response> => {
    const requestId = request.headers.get("x-request-id") || randomUUID();
    if (request.method !== "POST") {
      return errorResponse(
        405,
        "METHOD_NOT_ALLOWED",
        "Method not allowed",
        requestId,
      );
    }
    // The Edge gateway verifies the signature; this rejects normal user JWTs.
    if (!hasServiceRole(request.headers.get("authorization"))) {
      return errorResponse(
        403,
        "FORBIDDEN",
        "Service role required",
        requestId,
      );
    }

    try {
      const body = await readBody(request);
      const enqueueLimit = readPositiveInteger(body.enqueue_limit, 100, 500);
      const claimLimit = readPositiveInteger(body.claim_limit, 20, 100);
      const cutoff = readCutoff(body.cutoff, now());

      const supabaseUrl = dependencies.getEnvironment("SUPABASE_URL");
      const serviceRoleKey = dependencies.getEnvironment(
        "SUPABASE_SERVICE_ROLE_KEY",
      );
      if (!supabaseUrl || !serviceRoleKey) {
        throw new Error("Supabase service environment is incomplete");
      }

      const supabase = dependencies.createClient(supabaseUrl, serviceRoleKey);
      const { data: queued, error: enqueueError } = await supabase.rpc(
        "purge_expired_customers",
        { p_cutoff: cutoff, p_limit: enqueueLimit },
      );
      if (enqueueError) throw enqueueError;

      const { data: claimEnvelope, error: claimError } = await supabase.rpc(
        "claim_customer_purge_jobs",
        { p_limit: claimLimit },
      );
      if (claimError) throw claimError;

      const jobs = (claimEnvelope as { data?: PurgeJob[] } | null)?.data ?? [];
      let completed = 0;
      let resnapshotted = 0;
      let failed = 0;

      for (const job of jobs) {
        try {
          for (const pathChunk of chunksOf(job.object_paths, 100)) {
            const { error } = await supabase.storage
              .from("attachments")
              .remove(pathChunk);
            if (error) throw error;
          }

          const { data: completion, error } = await supabase.rpc(
            "complete_customer_purge_job",
            { p_job_id: job.id },
          );
          if (error) throw error;

          const status = (completion as { data?: { status?: string } } | null)
            ?.data?.status;
          if (status === "completed") completed += 1;
          else if (status === "retry") resnapshotted += 1;
        } catch (error) {
          failed += 1;
          const message =
            error instanceof Error ? error.message : String(error);
          const { error: retryError } = await supabase.rpc(
            "fail_customer_purge_job",
            { p_job_id: job.id, p_error: message },
          );
          if (retryError) {
            logError("Unable to persist purge retry", {
              request_id: requestId,
              job_id: job.id,
              code: retryError.code,
            });
          }
        }
      }

      return jsonResponse(
        200,
        {
          data: {
            queued: Number(queued ?? 0),
            claimed: jobs.length,
            completed,
            resnapshotted,
            failed,
          },
        },
        requestId,
      );
    } catch (error) {
      if (error instanceof RequestInputError) {
        return errorResponse(400, "INVALID_REQUEST", error.message, requestId);
      }
      logError("Customer purge execution failed", {
        request_id: requestId,
        error_name: error instanceof Error ? error.name : "UnknownError",
      });
      return errorResponse(
        500,
        "INTERNAL_ERROR",
        "Customer purge execution failed",
        requestId,
      );
    }
  };
};
