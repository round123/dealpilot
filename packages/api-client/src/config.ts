import type { SupabaseClientOptions } from "@supabase/supabase-js";
import { z } from "zod";

const SupabaseConnectionSchema = z.object({
  url: z.string().url(),
  anonKey: z.string().min(1),
});

export interface ApiClientConfig {
  url: string;
  anonKey: string;
  options?: SupabaseClientOptions<"public">;
  fetch?: typeof globalThis.fetch;
}

export interface ParsedApiClientConfig extends ApiClientConfig {
  url: string;
  anonKey: string;
}

export function parseApiClientConfig(config: ApiClientConfig): ParsedApiClientConfig {
  const connection = SupabaseConnectionSchema.parse({
    url: config.url,
    anonKey: config.anonKey,
  });

  return {
    ...config,
    ...connection,
    url: connection.url.replace(/\/$/, ""),
  };
}
