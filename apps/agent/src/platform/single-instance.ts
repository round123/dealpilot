/**
 * DealPilot 平台适配 - 单实例锁
 * 确保 Agent 单实例运行
 */

import { existsSync, mkdirSync, writeFileSync, readFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { config } from "../config/config";

const LOCK_FILE = join(config.dataDir, ".lock");

/**
 * 获取单实例锁
 * 返回 true 表示获取成功，false 表示已有实例运行
 */
export function acquireSingleInstanceLock(): boolean {
  try {
    if (existsSync(LOCK_FILE)) {
      // 检查锁文件中的 PID 是否还活着
      const lockContent = readFileSync(LOCK_FILE, "utf-8").trim();
      const pid = parseInt(lockContent, 10);

      if (!isNaN(pid)) {
        // 尝试检查进程是否存在
        try {
          process.kill(pid, 0);
          // 进程存在，已有实例运行
          return false;
        } catch {
          // 进程不存在，锁文件是残留的，可以获取锁
        }
      }
    }

    // 写入当前 PID
    writeFileSync(LOCK_FILE, String(process.pid));
    return true;
  } catch (err) {
    console.error("[single-instance] Failed to acquire lock:", err);
    return false;
  }
}

/**
 * 释放单实例锁
 */
export function releaseSingleInstanceLock(): void {
  try {
    if (existsSync(LOCK_FILE)) {
      unlinkSync(LOCK_FILE);
    }
  } catch {
    // 忽略
  }
}
