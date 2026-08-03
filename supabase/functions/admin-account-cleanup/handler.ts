import { hasServiceRole } from "../purge-expired-customers/auth.ts";

type DependencyError = { code?: string; message?: string; status?: number };
type RpcResult = { data: unknown; error: DependencyError | null };

export type AdminCleanupClient = {
  rpc: (
    name: string,
    parameters: Record<string, unknown>,
  ) => Promise<RpcResult>;
  storage: {
    from: (bucket: string) => {
      remove: (paths: string[]) => Promise<{ error: DependencyError | null }>;
    };
  };
  auth: {
    admin: {
      deleteUser: (
        userId: string,
        shouldSoftDelete: boolean,
      ) => Promise<{ error: DependencyError | null }>;
    };
  };
};

export type AdminCleanupHandlerDependencies = {
  createClient: (url: string, serviceRoleKey: string) => AdminCleanupClient;
  getEnvironment: (name: string) => string | undefined;
  randomUUID?: () => string;
  logError?: (message: string, details: Record<string, unknown>) => void;
};

type CleanupJob = {
  job_id: string;
  target_user_id?: string;
  status: "pending" | "processing" | "retry" | "completed" | "busy";
  attempt_count: number;
  storage_objects_deleted: number;
  object_paths?: string[];
  has_more_objects?: boolean;
};

class RequestInputError extends Error {}
class CleanupStepError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.code = code;
  }
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SAFE_IDENTIFIER_PATTERN = /^[A-Za-z0-9._@:-]+$/;
const CONFIRMATION = "PERMANENTLY DELETE DEALPILOT ACCOUNT";

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
  try {
    const value = (await request.json()) as unknown;
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new RequestInputError("Request body must be a JSON object");
    }
    return value as Record<string, unknown>;
  } catch (error) {
    if (error instanceof RequestInputError) throw error;
    throw new RequestInputError("Request body must be valid JSON");
  }
};

const readString = (
  body: Record<string, unknown>,
  field: string,
  maximum: number,
) => {
  const value = body[field];
  if (typeof value !== "string" || value.length < 1 || value.length > maximum) {
    throw new RequestInputError(`${field} is invalid`);
  }
  return value;
};

const readJob = (value: unknown): CleanupJob => {
  const job = (value as { data?: CleanupJob } | null)?.data;
  if (
    !job ||
    !UUID_PATTERN.test(job.job_id) ||
    typeof job.status !== "string" ||
    !Number.isInteger(job.attempt_count) ||
    !Number.isInteger(job.storage_objects_deleted)
  ) {
    throw new CleanupStepError("INVALID_JOB_RESPONSE");
  }
  return job;
};

const chunksOf = <T>(items: T[], size: number): T[][] => {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
};

const isUserNotFound = (error: DependencyError) =>
  error.status === 404 || error.code === "user_not_found";

export const createAdminCleanupHandler = (
  dependencies: AdminCleanupHandlerDependencies,
) => {
  const randomUUID = dependencies.randomUUID ?? (() => crypto.randomUUID());
  const logError = dependencies.logError ?? console.error;

  return async (request: Request): Promise<Response> => {
    const suppliedRequestId = request.headers.get("x-request-id");
    const requestId =
      suppliedRequestId &&
      suppliedRequestId.length <= 128 &&
      SAFE_IDENTIFIER_PATTERN.test(suppliedRequestId)
        ? suppliedRequestId
        : randomUUID();

    if (request.method !== "POST") {
      return errorResponse(
        405,
        "METHOD_NOT_ALLOWED",
        "Method not allowed",
        requestId,
      );
    }
    // The Edge gateway verifies the signature before this role check runs.
    if (!hasServiceRole(request.headers.get("authorization"))) {
      return errorResponse(
        403,
        "FORBIDDEN",
        "Service role required",
        requestId,
      );
    }

    let jobId: string | undefined;
    let deletedThisAttempt = 0;
    let client: AdminCleanupClient | undefined;

    try {
      const body = await readBody(request);
      const targetUserId = readString(body, "target_user_id", 36);
      const idempotencyKey = readString(body, "idempotency_key", 128);
      const approvalUrl = readString(body, "approval_url", 2048);
      const requestedBy = readString(body, "requested_by", 128);
      const confirmation = readString(body, "confirmation", 64);

      if (!UUID_PATTERN.test(targetUserId)) {
        throw new RequestInputError("target_user_id must be a UUID");
      }
      if (!SAFE_IDENTIFIER_PATTERN.test(idempotencyKey)) {
        throw new RequestInputError("idempotency_key is invalid");
      }
      if (!SAFE_IDENTIFIER_PATTERN.test(requestedBy)) {
        throw new RequestInputError("requested_by is invalid");
      }
      let parsedApprovalUrl: URL;
      try {
        parsedApprovalUrl = new URL(approvalUrl);
      } catch {
        throw new RequestInputError("approval_url must be a valid HTTPS URL");
      }
      if (parsedApprovalUrl.protocol !== "https:") {
        throw new RequestInputError("approval_url must be a valid HTTPS URL");
      }
      if (/\s/.test(approvalUrl)) {
        throw new RequestInputError("approval_url must be a valid HTTPS URL");
      }
      if (confirmation !== CONFIRMATION) {
        throw new RequestInputError("confirmation does not match");
      }

      const supabaseUrl = dependencies.getEnvironment("SUPABASE_URL");
      const serviceRoleKey = dependencies.getEnvironment(
        "SUPABASE_SERVICE_ROLE_KEY",
      );
      if (!supabaseUrl || !serviceRoleKey) {
        throw new CleanupStepError("SERVICE_ENVIRONMENT_INCOMPLETE");
      }
      client = dependencies.createClient(supabaseUrl, serviceRoleKey);

      const requested = await client.rpc("request_admin_account_cleanup", {
        p_target_user_id: targetUserId,
        p_idempotency_key: idempotencyKey,
        p_request_id: requestId,
        p_approval_url: approvalUrl,
        p_requested_by: requestedBy,
      });
      if (requested.error) {
        if (requested.error.code === "23505") {
          return errorResponse(
            409,
            "IDEMPOTENCY_CONFLICT",
            "Idempotency key is already bound to another cleanup request",
            requestId,
          );
        }
        throw new CleanupStepError("JOB_REQUEST_FAILED");
      }

      const requestedJob = readJob(requested.data);
      jobId = requestedJob.job_id;
      if (requestedJob.status === "completed") {
        return jsonResponse(
          200,
          { data: { ...requestedJob, replayed: true } },
          requestId,
        );
      }

      const claimed = await client.rpc("claim_admin_account_cleanup", {
        p_job_id: jobId,
        p_object_limit: 1000,
      });
      if (claimed.error) throw new CleanupStepError("JOB_CLAIM_FAILED");
      const claimedJob = readJob(claimed.data);
      if (claimedJob.status === "completed") {
        return jsonResponse(
          200,
          { data: { ...claimedJob, replayed: true } },
          requestId,
        );
      }
      if (claimedJob.status === "busy") {
        return errorResponse(
          409,
          "JOB_BUSY",
          "Account cleanup job is already processing",
          requestId,
        );
      }
      if (claimedJob.target_user_id !== targetUserId) {
        throw new CleanupStepError("JOB_TARGET_MISMATCH");
      }

      const paths = claimedJob.object_paths;
      if (
        !Array.isArray(paths) ||
        paths.some(
          (path) =>
            typeof path !== "string" ||
            !path.startsWith(`${targetUserId}/`) ||
            path.length <= targetUserId.length + 1,
        )
      ) {
        throw new CleanupStepError("INVALID_STORAGE_SNAPSHOT");
      }

      for (const pathChunk of chunksOf(paths, 100)) {
        const { error } = await client.storage
          .from("attachments")
          .remove(pathChunk);
        if (error) throw new CleanupStepError("STORAGE_DELETE_FAILED");
        deletedThisAttempt += pathChunk.length;
      }

      if (claimedJob.has_more_objects === true) {
        throw new CleanupStepError("STORAGE_BATCH_REMAINING");
      }

      const deletion = await client.auth.admin.deleteUser(targetUserId, false);
      if (deletion.error && !isUserNotFound(deletion.error)) {
        throw new CleanupStepError("AUTH_USER_DELETE_FAILED");
      }

      const completed = await client.rpc("complete_admin_account_cleanup", {
        p_job_id: jobId,
        p_storage_objects_deleted: deletedThisAttempt,
      });
      if (completed.error) {
        throw new CleanupStepError("CLEANUP_VERIFICATION_FAILED");
      }
      const completedJob = readJob(completed.data);
      return jsonResponse(
        200,
        { data: { ...completedJob, replayed: false } },
        requestId,
      );
    } catch (error) {
      if (error instanceof RequestInputError) {
        return errorResponse(400, "INVALID_REQUEST", error.message, requestId);
      }

      const failureCode =
        error instanceof CleanupStepError
          ? error.code
          : "UNEXPECTED_DEPENDENCY_FAILURE";
      let retryStatePersisted = false;
      if (client && jobId) {
        const failed = await client.rpc("fail_admin_account_cleanup", {
          p_job_id: jobId,
          p_error_code: failureCode,
          p_storage_objects_deleted: deletedThisAttempt,
        });
        retryStatePersisted = failed.error === null;
      }
      logError("Controlled account cleanup did not complete", {
        request_id: requestId,
        job_id: jobId,
        failure_code: failureCode,
        retry_state_persisted: retryStatePersisted,
      });

      if (jobId && retryStatePersisted) {
        return errorResponse(
          503,
          "ACCOUNT_CLEANUP_RETRY_REQUIRED",
          "Account cleanup did not complete and is available for controlled retry",
          requestId,
        );
      }
      return errorResponse(
        500,
        "INTERNAL_ERROR",
        "Account cleanup could not persist a retry state",
        requestId,
      );
    }
  };
};

export { CONFIRMATION as ADMIN_ACCOUNT_CLEANUP_CONFIRMATION };
