/**
 * DealPilot Agent 配置
 * 端口、数据目录、DB 路径、web 资源目录、一次性工作台 token、Origin 白名单
 *
 * 数据目录策略（G1 Spike S1 判据：非管理员可写、卸载无残留）：
 * - 已编译 exe（安装运行）：%LOCALAPPDATA%\DealPilot\data —— 不落 Program Files，非管理员可写
 * - 开发模式（bun src/index.ts）：沿用仓库内 data 目录，不破坏现有 db
 * web 资源目录：编译 exe 同级 web/；开发模式 apps/cloud/dist（Atomic CRM 构建产物）
 */

import { generateUUID } from "@dealpilot/shared";
import {
  AGENT_DEFAULT_PORT,
  API_VERSION,
  APP_VERSION,
  SQLITE_BUSY_TIMEOUT_MS,
} from "@dealpilot/shared";
import { mkdirSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";

/**
 * 是否为已编译的 dealpilot-agent.exe（区别于 bun 开发模式）
 * bun 开发模式下 process.execPath 指向 bun 二进制
 */
function isCompiledExe(): boolean {
  return basename(process.execPath).toLowerCase() === "dealpilot-agent.exe";
}

/**
 * 解析应用数据根目录
 * 编译 exe：LOCALAPPDATA\DealPilot（安装态，非管理员可写）
 * 开发态：DEALPILOT_DATA_DIR 环境变量覆盖，否则沿用 cwd/data
 */
function resolveAppDataDir(): string {
  if (process.env.DEALPILOT_DATA_DIR)
    return resolve(process.env.DEALPILOT_DATA_DIR);
  if (isCompiledExe() && process.env.LOCALAPPDATA) {
    return join(process.env.LOCALAPPDATA, "DealPilot");
  }
  return resolve(process.cwd(), "data");
}

/**
 * 解析 web 静态资源目录
 * 编译 exe：exe 同级 web/（安装包 app\web\）
 * 开发态：DEALPILOT_WEB_DIR 覆盖，否则 apps/cloud/dist（Atomic CRM 构建产物，dev 由 Vite 代理）
 */
export function resolveWebDir(
  override = process.env.DEALPILOT_WEB_DIR,
  executablePath = process.execPath,
  workingDirectory = process.cwd(),
): string {
  if (override) return resolve(workingDirectory, override);
  if (basename(executablePath).toLowerCase() === "dealpilot-agent.exe") {
    return join(dirname(executablePath), "web");
  }
  return resolve(workingDirectory, "apps/cloud/dist");
}

const APP_DATA_DIR = resolveAppDataDir();
const DATA_DIR = join(APP_DATA_DIR, "data");
const DB_PATH = join(DATA_DIR, "dealpilot.db");
const WEB_DIR = resolveWebDir();

// 确保数据目录存在
try {
  mkdirSync(DATA_DIR, { recursive: true });
} catch {
  // 目录已存在则忽略
}

/** 一次性工作台 token，启动时生成，通过 URL 传给浏览器 */
const WORKBENCH_TOKEN = generateUUID();

export function parseAdditionalAllowedOrigins(value?: string): string[] {
  if (!value?.trim()) return [];
  return value
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean)
    .map((origin) => {
      const url = new URL(origin);
      if (
        (url.protocol !== "http:" && url.protocol !== "https:") ||
        url.origin !== origin
      ) {
        throw new Error(`Invalid DEALPILOT_ALLOWED_ORIGINS entry: ${origin}`);
      }
      return url.origin;
    });
}

export function resolveWorkbenchOrigin(
  value = process.env.DEALPILOT_WORKBENCH_ORIGIN,
): string {
  const origin = value?.trim() || `http://127.0.0.1:${AGENT_DEFAULT_PORT}`;
  const url = new URL(origin);
  if (
    url.origin !== origin ||
    (url.hostname !== "127.0.0.1" && url.hostname !== "localhost")
  ) {
    throw new Error("DEALPILOT_WORKBENCH_ORIGIN must be an exact loopback origin");
  }
  return url.origin;
}

/** Origin 白名单默认只允许 Agent 同源，可通过环境变量精确追加开发源。 */
const ALLOWED_ORIGINS = Array.from(
  new Set([
    `http://127.0.0.1:${AGENT_DEFAULT_PORT}`,
    `http://localhost:${AGENT_DEFAULT_PORT}`,
    ...parseAdditionalAllowedOrigins(process.env.DEALPILOT_ALLOWED_ORIGINS),
  ]),
);

const WORKBENCH_ORIGIN = resolveWorkbenchOrigin();
/** 工作台 URL（含 token，只用于直接启动浏览器，不写日志） */
const WORKBENCH_URL = `${WORKBENCH_ORIGIN}/?token=${encodeURIComponent(WORKBENCH_TOKEN)}#/`;

export const config = {
  port: AGENT_DEFAULT_PORT,
  host: "127.0.0.1",
  appDataDir: APP_DATA_DIR,
  dataDir: DATA_DIR,
  dbPath: DB_PATH,
  webDir: WEB_DIR,
  token: WORKBENCH_TOKEN,
  workbenchOrigin: WORKBENCH_ORIGIN,
  workbenchUrl: WORKBENCH_URL,
  allowedOrigins: ALLOWED_ORIGINS,
  apiVersion: API_VERSION,
  appVersion: APP_VERSION,
  dbSchemaVersion: "1.0.0",
  sqliteBusyTimeout: SQLITE_BUSY_TIMEOUT_MS,
} as const;

export type AppConfig = typeof config;
