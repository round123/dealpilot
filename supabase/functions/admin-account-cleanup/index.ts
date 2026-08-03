import { createClient } from "npm:@supabase/supabase-js@2.111.0";
import { createAdminCleanupHandler } from "./handler.ts";

Deno.serve(
  createAdminCleanupHandler({
    createClient: (url, serviceRoleKey) =>
      createClient(url, serviceRoleKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      }),
    getEnvironment: (name) => Deno.env.get(name),
  }),
);
