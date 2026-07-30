import {
  createClient,
  type SupabaseClient,
} from "@supabase/supabase-js";
import { parseApiClientConfig, type ApiClientConfig } from "./config.js";

export function createSupabaseClient(config: ApiClientConfig): SupabaseClient {
  const parsed = parseApiClientConfig(config);
  const globalOptions = {
    ...parsed.options?.global,
    ...(parsed.fetch === undefined ? {} : { fetch: parsed.fetch }),
  };

  return createClient(parsed.url, parsed.anonKey, {
    ...parsed.options,
    global: globalOptions,
  });
}
