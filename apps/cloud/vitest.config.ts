import { playwright } from "@vitest/browser-playwright";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    exclude: ["playwright", "playwright-core"],
    include: ["faker/locale/zh_CN"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    globals: true,
    browser: {
      headless: true,
      provider: playwright(),
      enabled: true,
      instances: [
        {
          browser: "chromium",
          ...(process.env.CI && {
            launch: { channel: "chromium-headless-shell" },
          }),
        },
      ],
      commands: {
        async setTimezone({ context, page }, timezoneId: string) {
          const session = await context.newCDPSession(page);
          await session.send("Emulation.setTimezoneOverride", { timezoneId });
          await session.detach();
        },
      },
    },
    exclude: ["**/node_modules/**", "e2e/**"],
    server: {
      deps: {
        external: [/playwright/],
      },
    },
  },
});
