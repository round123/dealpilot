import { defineConfig } from "wxt";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  manifest: {
    name: "DealPilot",
    description: "DealPilot - 外贸经理工作台助手",
    // 稳定扩展 ID（由 scripts/gen-ext-key.ts 生成）：mblecgcjdmeialnhjbbbbgilklkbpdhn
    // Agent 端 NM 白名单与此 ID 匹配，确保任意路径加载插件都能配对
    key: "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAyBxV7nbbitCBUzK+oxqU3L3e8i7vtX7q/1LvWzz2mtBOxon1WoAfWf7odrWqOjwqzfuOcrMJ7JeO5HgelCEsmZ+Wb9EICEn/K1b11xHLVhWjbKtTUkr2t+4805PN7Qx8sfN/5ZX0ala6P5aqSLquqBPqomiwXuf4DdmPCOVXyLXms0T4Ns9+/cohqXFRJEDKWgeZ9GZEXHwkcTBNedVxmVeEcOpnR5H9PJIO2bC1u6x3zc+CMKQ/66dkVf6S+UoyIR68nB6l6cYTasYeXsSOLXnvJ5r25Wueu7GNNXxZsRr5jDvJT1RrUi1oto88IWGyARix5OkirnNkPaSdGy26+wIDAQAB",
    permissions: ["nativeMessaging", "storage", "activeTab", "alarms"],
    host_permissions: [
      "https://web.whatsapp.com/*",
      "https://web.telegram.org/*",
    ],
    action: {
      default_popup: "popup/index.html",
    },
  },
  vite: () => ({
    plugins: [react()],
    resolve: {
      alias: {
        "@dealpilot/shared": resolve(__dirname, "../../packages/shared/src"),
      },
    },
  }),
});
