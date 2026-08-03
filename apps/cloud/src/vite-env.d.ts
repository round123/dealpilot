/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_IS_DEMO?: "true" | "false";
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SB_PUBLISHABLE_KEY?: string;
  readonly VITE_ATTACHMENTS_BUCKET?: string;
  readonly VITE_DEALPILOT_CHROME_EXTENSION_URL?: string;
  readonly VITE_DEALPILOT_EDGE_EXTENSION_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
