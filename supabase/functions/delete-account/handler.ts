type AuthUser = { id: string };

type ServiceError = {
  code?: string;
  message?: string;
};

type StorageEntry = {
  id?: string | null;
  name: string;
};

export type DeleteAccountClient = {
  auth: {
    getUser: (jwt: string) => Promise<{
      data: { user: AuthUser | null };
      error: ServiceError | null;
    }>;
    admin: {
      deleteUser: (userId: string) => Promise<{ error: ServiceError | null }>;
    };
  };
  storage: {
    from: (bucket: string) => {
      list: (
        path: string,
        options: {
          limit: number;
          offset: number;
          sortBy: { column: "name"; order: "asc" };
        },
      ) => Promise<{ data: StorageEntry[] | null; error: ServiceError | null }>;
      remove: (paths: string[]) => Promise<{ error: ServiceError | null }>;
    };
  };
};

export type DeleteAccountHandlerDependencies = {
  createClient: (url: string, serviceRoleKey: string) => DeleteAccountClient;
  getEnvironment: (name: string) => string | undefined;
  randomUUID?: () => string;
  logError?: (message: string, details: Record<string, unknown>) => void;
};

const PAGE_SIZE = 100;
const REMOVE_BATCH_SIZE = 100;
const ATTACHMENTS_BUCKET = "attachments";

const corsHeaders = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers":
    "authorization, x-client-info, apikey, content-type, x-request-id",
  "access-control-allow-methods": "POST, OPTIONS",
};

const jsonResponse = (
  status: number,
  body: Record<string, unknown>,
  requestId: string,
) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
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

const bearerToken = (authorization: string | null): string | undefined => {
  const match = authorization?.match(/^Bearer\s+(.+)$/i);
  const token = match?.[1]?.trim();
  return token || undefined;
};

const chunksOf = <T>(items: T[], size: number): T[][] => {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
};

const listObjectPaths = async (
  client: DeleteAccountClient,
  rootPath: string,
): Promise<string[]> => {
  const bucket = client.storage.from(ATTACHMENTS_BUCKET);
  const paths: string[] = [];
  const pendingDirectories = [rootPath];

  while (pendingDirectories.length > 0) {
    const directory = pendingDirectories.shift()!;
    let offset = 0;

    while (true) {
      const { data, error } = await bucket.list(directory, {
        limit: PAGE_SIZE,
        offset,
        sortBy: { column: "name", order: "asc" },
      });
      if (error) throw error;

      const entries = data ?? [];
      for (const entry of entries) {
        const path = `${directory}/${entry.name}`;
        if (entry.id) paths.push(path);
        else pendingDirectories.push(path);
      }

      if (entries.length < PAGE_SIZE) break;
      offset += PAGE_SIZE;
    }
  }

  return paths;
};

export const createDeleteAccountHandler = (
  dependencies: DeleteAccountHandlerDependencies,
) => {
  const randomUUID = dependencies.randomUUID ?? (() => crypto.randomUUID());
  const logError = dependencies.logError ?? console.error;

  return async (request: Request): Promise<Response> => {
    const requestId = request.headers.get("x-request-id") || randomUUID();

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }
    if (request.method !== "POST") {
      return errorResponse(
        405,
        "METHOD_NOT_ALLOWED",
        "Method not allowed",
        requestId,
      );
    }

    const token = bearerToken(request.headers.get("authorization"));
    if (!token) {
      return errorResponse(
        401,
        "UNAUTHORIZED",
        "Authentication required",
        requestId,
      );
    }

    try {
      const supabaseUrl = dependencies.getEnvironment("SUPABASE_URL");
      const serviceRoleKey = dependencies.getEnvironment(
        "SUPABASE_SERVICE_ROLE_KEY",
      );
      if (!supabaseUrl || !serviceRoleKey) {
        throw new Error("Supabase service environment is incomplete");
      }

      const client = dependencies.createClient(supabaseUrl, serviceRoleKey);
      const { data, error: userError } = await client.auth.getUser(token);
      if (userError || !data.user) {
        return errorResponse(401, "UNAUTHORIZED", "Invalid session", requestId);
      }

      const userId = data.user.id;
      const objectPaths = await listObjectPaths(client, userId);
      const bucket = client.storage.from(ATTACHMENTS_BUCKET);
      for (const batch of chunksOf(objectPaths, REMOVE_BATCH_SIZE)) {
        const { error } = await bucket.remove(batch);
        if (error) throw error;
      }

      const { error: deleteError } = await client.auth.admin.deleteUser(userId);
      if (deleteError) throw deleteError;

      return jsonResponse(200, { data: { deleted: true } }, requestId);
    } catch (error) {
      logError("Account deletion failed", {
        request_id: requestId,
        error_name: error instanceof Error ? error.name : "UnknownError",
      });
      return errorResponse(
        500,
        "ACCOUNT_DELETION_FAILED",
        "Account deletion failed",
        requestId,
      );
    }
  };
};
