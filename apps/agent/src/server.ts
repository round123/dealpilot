/**
 * DealPilot HTTP 服务器
 * Hono app 装配：挂载所有路由 + 中间件
 *
 * 路由分流：
 * - /api/* → Hono app（业务 API）
 * - 其它 → web 静态资源（SPA，未命中文件回退 index.html，支持前端路由）
 *   开发模式下 web 资源目录不存在，回退到 Hono 404（UI 由 Vite dev server 提供）
 */

import { Hono } from "hono";
import { config } from "./config/config";
import { requestIdMiddleware } from "./middleware/request-id";
import { originGuardMiddleware } from "./middleware/origin-guard";
import { handleError } from "./middleware/error-handler";
import type { AppEnv } from "./types/hono";
import { authMiddleware } from "./middleware/auth";
import { idempotencyMiddleware } from "./middleware/idempotency";
import { restoreGuardMiddleware } from "./middleware/restore-guard";

// 路由
import healthRoutes from "./routes/health";
import customerRoutes from "./routes/customers";
import contactRoutes from "./routes/contacts";
import socialAccountRoutes from "./routes/social-accounts";
import matchRoutes from "./routes/matches";
import followUpRoutes from "./routes/follow-ups";
import reminderRoutes from "./routes/reminders";
import projectRoutes from "./routes/projects";
import riskRoutes from "./routes/risks";
import milestoneRoutes from "./routes/milestones";
import importRoutes from "./routes/imports";
import exportRoutes from "./routes/exports";
import backupRoutes from "./routes/backups";
import settingsRoutes from "./routes/settings";
import statsRoutes from "./routes/stats";

import { existsSync } from "node:fs";
import { join, normalize } from "node:path";

/** web 资源目录与 SPA 入口 */
const WEB_DIR = config.webDir;
const INDEX_HTML = join(WEB_DIR, "index.html");
const WEB_DIR_LOWER = WEB_DIR.toLowerCase();

/** 常见静态资源 MIME 类型 */
const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".map": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
};

function mimeFor(filePath: string): string {
  const dot = filePath.lastIndexOf(".");
  if (dot < 0) return "application/octet-stream";
  return MIME[filePath.slice(dot).toLowerCase()] ?? "application/octet-stream";
}

/**
 * 尝试服务 web 静态资源
 * 命中文件返回该文件；未命中回退 index.html（SPA 前端路由）
 * web 目录不存在（开发模式）返回 null，交由 Hono 处理
 */
async function serveWebAsset(pathname: string): Promise<Response | null> {
  if (!existsSync(WEB_DIR) || !existsSync(INDEX_HTML)) return null;

  // 防 path traversal：归一化后必须仍在 WEB_DIR 内
  const rel = normalize(pathname).replace(/^[/\\]+/, "");
  const filePath = join(WEB_DIR, rel);
  if (!filePath.toLowerCase().startsWith(WEB_DIR_LOWER)) return null;

  let file = Bun.file(filePath);
  if (await file.exists()) {
    return new Response(file, {
      headers: { "content-type": mimeFor(filePath) },
    });
  }

  // SPA 回退：非 /api 路径统一返回 index.html，交由前端路由处理
  file = Bun.file(INDEX_HTML);
  if (await file.exists()) {
    return new Response(file, {
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
  return null;
}

/**
 * 创建 Hono app
 */
export function createApp(): Hono<AppEnv> {
  const app = new Hono<AppEnv>();
  app.onError((error, c) => handleError(error, c));

  // 全局中间件（请求 ID -> Origin 校验）
  app.use("*", requestIdMiddleware);
  app.use("*", originGuardMiddleware);

  // 健康检查路由（无需认证）
  app.route("/api/v1", healthRoutes);

  // 认证中间件（除 /health 外全部需要认证）
  app.use("/api/v1/*", authMiddleware);
  app.use("/api/v1/*", restoreGuardMiddleware);

  // 幂等中间件
  app.use("/api/v1/*", idempotencyMiddleware);

  // 业务路由
  app.route("/api/v1", customerRoutes);
  app.route("/api/v1", contactRoutes);
  app.route("/api/v1", socialAccountRoutes);
  app.route("/api/v1", matchRoutes);
  app.route("/api/v1", followUpRoutes);
  app.route("/api/v1", reminderRoutes);
  app.route("/api/v1", projectRoutes);
  app.route("/api/v1", riskRoutes);
  app.route("/api/v1", milestoneRoutes);
  app.route("/api/v1", importRoutes);
  app.route("/api/v1", exportRoutes);
  app.route("/api/v1", backupRoutes);
  app.route("/api/v1", settingsRoutes);
  app.route("/api/v1", statsRoutes);

  // 404 handler
  app.notFound((c) => {
    return c.json(
      {
        error: {
          code: "NOT_FOUND",
          message: "Endpoint not found",
          request_id: c.get("requestId") ?? undefined,
        },
      },
      404,
    );
  });

  return app;
}

/**
 * 启动 HTTP 服务器
 */
export async function startServer(): Promise<void> {
  const app = createApp();

  const server = Bun.serve({
    port: config.port,
    hostname: config.host,
    fetch: async (req) => {
      const url = new URL(req.url);

      // API 路由交给 Hono
      if (url.pathname.startsWith("/api/")) {
        return app.fetch(req);
      }

      // 其它路径尝试服务 web 静态资源（SPA）
      const asset = await serveWebAsset(url.pathname);
      if (asset) return asset;

      // 开发模式（无 web 资源目录）：回退到 Hono（/api 仍可用，/ 返回 404，UI 由 Vite 提供）
      return app.fetch(req);
    },
  });

  console.log(`[server] DealPilot Agent running at http://${config.host}:${config.port}`);
  console.log(`[server] Workbench origin: ${config.workbenchOrigin}`);
  if (existsSync(INDEX_HTML)) {
    console.log(`[server] Web UI served from: ${WEB_DIR}`);
  } else {
    console.log("[server] Web UI dir not found (dev mode: UI served by Vite)");
  }

  // 将 server 实例存储以便优雅关闭
  globalThis.__dealpilot_server = server;
}

// 全局服务器引用声明
declare global {
  // eslint-disable-next-line no-var
  var __dealpilot_server: ReturnType<typeof Bun.serve> | undefined;
}
