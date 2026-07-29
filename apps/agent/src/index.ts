/**
 * DealPilot Agent 入口
 *
 * 启动流程：
 * 1. 单实例锁检查
 * 2. 数据库迁移
 * 3. 启动 HTTP 服务器
 * 4. 启动调度器
 * 5. 启动托盘
 * 6. 自动打开浏览器
 *
 * 关闭流程：
 * 1. 停止调度器
 * 2. 停止托盘
 * 3. 关闭 HTTP 服务器
 * 4. 释放单实例锁
 */

import { config } from "./config/config";
import { acquireSingleInstanceLock, releaseSingleInstanceLock } from "./platform/single-instance";
import { runMigrations, ensureSchema } from "./db/migrate";
import { startServer } from "./server";
import { startReminderScheduler, stopReminderScheduler } from "./scheduler/reminder-scheduler";
import { startMilestoneScheduler, stopMilestoneScheduler } from "./scheduler/milestone-scheduler";
import { startCleanupScheduler, stopCleanupScheduler } from "./scheduler/cleanup-scheduler";
import { startTray, stopTray } from "./platform/tray";
import { launchBrowser } from "./platform/browser-launch";
import {
  isNativeMessagingInvocation,
  runNativeMessagingHost,
  registerNativeMessaging,
  writeRuntimeInfo,
} from "./platform/native-messaging-host";

async function main() {
  // Native Messaging 模式：Chrome 以 NM 方式拉起本 exe（argv 含 chrome-extension://<id>/）
  // → 走 stdio 协议返回 token，不启动服务器/调度器/托盘
  if (isNativeMessagingInvocation(process.argv)) {
    await runNativeMessagingHost(process.argv);
    process.exit(0);
  }

  console.log("[agent] DealPilot Agent starting...");

  // 1. 单实例锁
  if (!acquireSingleInstanceLock()) {
    console.error("[agent] Another instance is already running. Exiting.");
    process.exit(1);
  }
  console.log("[agent] Single instance lock acquired.");

  // 2. 数据库迁移
  try {
    runMigrations();
    ensureSchema();
    console.log("[agent] Database migrations completed.");
  } catch (err) {
    console.error("[agent] Migration failed:", err);
    // 继续启动，schema 可能已存在
  }

  // 3. 启动 HTTP 服务器
  await startServer();

  // 注册 Native Messaging Host + 写 runtime info（供扩展通过 NM 配对）
  if (process.env.DEALPILOT_SKIP_NM_REGISTRATION !== "1") {
    registerNativeMessaging();
  }
  writeRuntimeInfo();

  // 4. 启动调度器
  startReminderScheduler();
  startMilestoneScheduler();
  startCleanupScheduler();
  console.log("[agent] Schedulers started.");

  // 5. 启动托盘（.NET NotifyIcon 子进程；菜单点击经 stdout 通知）
  if (process.env.DEALPILOT_SKIP_TRAY !== "1") {
    await startTray({ onOpen: () => launchBrowser(), onQuit: () => shutdown() });
  }

  // 6. 自动打开浏览器
  if (process.env.DEALPILOT_SKIP_BROWSER !== "1") {
    await launchBrowser();
  }

  console.log("[agent] DealPilot Agent started successfully.");
  console.log(`[agent] Token: ${config.token}`);
  console.log(`[agent] Workbench: ${config.workbenchUrl}`);

  // 优雅关闭（function 声明，可在 startTray 的 onQuit 中前向引用）
  async function shutdown() {
    console.log("[agent] Shutting down...");

    stopReminderScheduler();
    stopMilestoneScheduler();
    stopCleanupScheduler();
    stopTray();

    if (globalThis.__dealpilot_server) {
      globalThis.__dealpilot_server.stop();
    }

    releaseSingleInstanceLock();
    console.log("[agent] Shutdown complete.");
    process.exit(0);
  }

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error("[agent] Fatal error:", err);
  process.exit(1);
});
