interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SB_PUBLISHABLE_KEY?: string;
  readonly VITE_DEALPILOT_WEB_URL?: string;
  readonly VITE_DEALPILOT_EXTENSION_UNINSTALL_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
