export type DeleteAccountHandlerDependencies = {
  randomUUID?: () => string;
};

const corsHeaders = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers":
    "authorization, x-client-info, apikey, content-type, x-request-id",
  "access-control-allow-methods": "POST, OPTIONS",
};

const errorResponse = (
  status: number,
  code: string,
  message: string,
  requestId: string,
) =>
  new Response(
    JSON.stringify({ error: { code, message, request_id: requestId } }),
    {
      status,
      headers: {
        ...corsHeaders,
        "content-type": "application/json; charset=utf-8",
        "x-request-id": requestId,
      },
    },
  );

export const createDeleteAccountHandler = (
  dependencies: DeleteAccountHandlerDependencies = {},
) => {
  const randomUUID = dependencies.randomUUID ?? (() => crypto.randomUUID());

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

    return errorResponse(
      404,
      "FEATURE_DISABLED",
      "Self-service account deletion is not available",
      requestId,
    );
  };
};
