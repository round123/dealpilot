/**
 * DealPilot 平台适配 - 浏览器启动
 * 自动打开浏览器到工作台 URL
 */

import { config } from "../config/config";

/**
 * 自动打开浏览器到工作台 URL
 * Windows: 使用 start 命令
 */
export async function launchBrowser(): Promise<void> {
  const url = config.workbenchUrl;
  try {
    // Windows 下使用 start 命令
    const proc = Bun.spawn(["cmd", "/c", "start", "", url]);
    await proc.exited;
    console.log("[browser] Launched browser to workbench");
  } catch (err) {
    console.error("[browser] Failed to launch browser:", err);
    console.log(`[browser] Please open manually: ${url}`);
  }
}
