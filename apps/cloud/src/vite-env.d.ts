/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_DEALPILOT_CHROME_EXTENSION_URL?: string;
  readonly VITE_DEALPILOT_EDGE_EXTENSION_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
