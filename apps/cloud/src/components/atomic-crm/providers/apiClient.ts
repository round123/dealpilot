import { createApiClient, type ApiClient } from "@dealpilot/api-client";

let apiClient: ApiClient | undefined;

export const getCloudApiClient = (): ApiClient => {
  apiClient ??= createApiClient({
    url: import.meta.env.VITE_SUPABASE_URL,
    anonKey: import.meta.env.VITE_SB_PUBLISHABLE_KEY,
    options: {
      auth: {
        flowType: "pkce",
        detectSessionInUrl: false,
      },
    },
  });
  return apiClient;
};
