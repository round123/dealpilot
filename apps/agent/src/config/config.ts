/**
 * DealPilot Agent 配置
 * 端口、数据目录、DB 路径、web 资源目录、一次性工作台 token、Origin 白名单
 *
 * 数据目录策略（G1 Spike S1 判据：非管理员可写、卸载无残留）：
 * - 已编译 exe（安装运行）：%LOCALAPPDATA%\DealPilot\data —— 不落 Program Files，非管理员可写
 * - 开发模式（bun src/index.ts）：沿用仓库内 data 目录，不破坏现有 db
 * web 资源目录：编译 exe 同级 web/；开发模式 apps/web/dist（vite build 产物）
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
  if (process.env.DEALPILOT_DATA_DIR) return resolve(process.env.DEALPILOT_DATA_DIR);
  if (isCompiledExe() && process.env.LOCALAPPDATA) {
    return join(process.env.LOCALAPPDATA, "DealPilot");
  }
  return resolve(process.cwd(), "data");
}

/**
 * 解析 web 静态资源目录
 * 编译 exe：exe 同级 web/（安装包 app\web\）
 * 开发态：DEALPILOT_WEB_DIR 覆盖，否则 apps/web/dist（vite build 产物，dev 由 Vite 代理）
 */
function resolveWebDir(): string {
  if (process.env.DEALPILOT_WEB_DIR) return resolve(process.env.DEALPILOT_WEB_DIR);
  if (isCompiledExe()) return join(dirname(process.execPath), "web");
  return resolve(process.cwd(), "apps/web/dist");
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

/** Origin 白名单，只允许本地回环 */
const ALLOWED_ORIGINS = [
  `http://127.0.0.1:${AGENT_DEFAULT_PORT}`,
  `http://localhost:${AGENT_DEFAULT_PORT}`,
];

/** 工作台 URL（含 token） */
const WORKBENCH_URL = `http://127.0.0.1:${AGENT_DEFAULT_PORT}/?token=${WORKBENCH_TOKEN}`;

export const config = {
  port: AGENT_DEFAULT_PORT,
  host: "127.0.0.1",
  appDataDir: APP_DATA_DIR,
  dataDir: DATA_DIR,
  dbPath: DB_PATH,
  webDir: WEB_DIR,
  token: WORKBENCH_TOKEN,
  workbenchUrl: WORKBENCH_URL,
  allowedOrigins: ALLOWED_ORIGINS,
  apiVersion: API_VERSION,
  appVersion: APP_VERSION,
  dbSchemaVersion: "1.0.0",
  sqliteBusyTimeout: SQLITE_BUSY_TIMEOUT_MS,
} as const;

export type AppConfig = typeof config;
