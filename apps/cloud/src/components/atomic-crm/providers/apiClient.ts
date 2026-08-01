import {
  API_ERROR_CODES,
  ApiError,
  createApiClient,
  type ApiClient,
} from "@dealpilot/api-client";

let apiClient: ApiClient | undefined;

export const getCloudApiClient = (): ApiClient => {
  apiClient ??= createApiClient({
    url: requireCloudConfig("VITE_SUPABASE_URL", import.meta.env.VITE_SUPABASE_URL),
    anonKey: requireCloudConfig(
      "VITE_SB_PUBLISHABLE_KEY",
      import.meta.env.VITE_SB_PUBLISHABLE_KEY,
    ),
    options: {
      auth: {
        flowType: "pkce",
        detectSessionInUrl: false,
      },
    },
  });
  return apiClient;
};

const requireCloudConfig = (name: string, value: string | undefined) => {
  if (value?.trim()) return value;
  throw new ApiError({
    code: API_ERROR_CODES.invalidResponse,
    message: `${name} is required for the Cloud runtime`,
  });
};
