import { defineConfig } from "wxt";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

const configuredSupabaseOrigin = (() => {
  try {
    return process.env.VITE_SUPABASE_URL
      ? `${new URL(process.env.VITE_SUPABASE_URL).origin}/*`
      : undefined;
  } catch {
    return undefined;
  }
})();

export default defineConfig({
  imports: false,
  modules: ["@wxt-dev/module-react"],
  manifest: {
    name: "DealPilot",
    description: "DealPilot - 外贸经理工作台助手",
    // 稳定扩展 ID（由 scripts/gen-ext-key.ts 生成）：mblecgcjdmeialnhjbbbbgilklkbpdhn
    key: "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAyBxV7nbbitCBUzK+oxqU3L3e8i7vtX7q/1LvWzz2mtBOxon1WoAfWf7odrWqOjwqzfuOcrMJ7JeO5HgelCEsmZ+Wb9EICEn/K1b11xHLVhWjbKtTUkr2t+4805PN7Qx8sfN/5ZX0ala6P5aqSLquqBPqomiwXuf4DdmPCOVXyLXms0T4Ns9+/cohqXFRJEDKWgeZ9GZEXHwkcTBNedVxmVeEcOpnR5H9PJIO2bC1u6x3zc+CMKQ/66dkVf6S+UoyIR68nB6l6cYTasYeXsSOLXnvJ5r25Wueu7GNNXxZsRr5jDvJT1RrUi1oto88IWGyARix5OkirnNkPaSdGy26+wIDAQAB",
    permissions: ["storage", "activeTab", "alarms"],
    host_permissions: [
      "https://web.whatsapp.com/*",
      "https://web.telegram.org/*",
      configuredSupabaseOrigin ?? "https://*.supabase.co/*",
    ],
    action: {
      default_popup: "popup/index.html",
    },
  },
  vite: () => ({
    plugins: [react()],
    resolve: {
      alias: [
        {
          find: "@dealpilot/api-client/error",
          replacement: resolve(__dirname, "../../packages/api-client/src/error.ts"),
        },
        {
          find: "@dealpilot/api-client",
          replacement: resolve(__dirname, "../../packages/api-client/src/index.ts"),
        },
        {
          find: "@dealpilot/shared",
          replacement: resolve(__dirname, "../../packages/shared/src"),
        },
      ],
    },
  }),
});
