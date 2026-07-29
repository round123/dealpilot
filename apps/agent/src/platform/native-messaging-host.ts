/**
 * DealPilot Native Messaging Host（Agent 端）
 *
 * 两条职责：
 * 1. registerNativeMessaging()：正常启动时写 NM manifest + 注册 HKCU（Chrome/Edge），
 *    使扩展能通过 connectNative('com.dealpilot.agent') 发现并拉起本 exe。
 * 2. runNativeMessagingHost()：Chrome 以 NM 方式拉起本 exe 时（argv 含 chrome-extension://<id>/）
 *    走 stdio 4 字节小端长度前缀 JSON 协议：校验扩展 ID 白名单 → 回 {type:"auth",token,port}。
 *
 * NM 协议（Chrome 文档）：每条消息 = 4 字节小端无符号长度 + UTF-8 JSON。
 *
 * 配对令牌：复用 config.token（一次性工作台 token，启动时生成，浏览器与插件共享）。
 * 运行中的 Agent 把 {port,token,pid} 写入 %LOCALAPPDATA%\DealPilot\agent.runtime.json，
 * NM host 进程（独立 exe 拉起）读取该文件拿到当前令牌——NM host 进程不能直接读 config.token
 * （config.ts 每次 import 都生成新 token）。
 */

import { Buffer } from "node:buffer";
import { config } from "../config/config";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const NM_HOST_NAME = "com.dealpilot.agent";
const NM_MANIFEST_PATH = join(config.appDataDir, "com.dealpilot.agent.json");
const RUNTIME_INFO_PATH = join(config.appDataDir, "agent.runtime.json");

const REG_KEYS = [
  `HKCU\\Software\\Google\\Chrome\\NativeMessagingHosts\\${NM_HOST_NAME}`,
  `HKCU\\Software\\Microsoft\\Edge\\NativeMessagingHosts\\${NM_HOST_NAME}`,
];

/**
 * 允许的扩展 ID 白名单。
 * 默认含 scripts/gen-ext-key.ts 生成的稳定 ID；可用 DEALPILOT_NM_EXTENSION_IDS（逗号分隔）追加（如 Web Store ID）。
 */
const ALLOWED_EXTENSION_IDS: string[] = (() => {
  const ids = ["mblecgcjdmeialnhjbbbbgilklkbpdhn"];
  const extra = process.env.DEALPILOT_NM_EXTENSION_IDS;
  if (extra) {
    ids.push(...extra.split(",").map((s) => s.trim()).filter(Boolean));
  }
  return ids;
})();

// -------------------------------------------------------------------------- argv

/** argv 是否为 Chrome NM 拉起（含 chrome-extension://<id>/） */
export function isNativeMessagingInvocation(argv: string[]): boolean {
  return argv.some((a) => a.startsWith("chrome-extension://"));
}

/** 从 argv 提取调用方扩展 ID */
function extractExtensionId(argv: string[]): string | null {
  for (const a of argv) {
    const m = a.match(/^chrome-extension:\/\/([a-p]{32})\/?$/);
    if (m) return m[1];
  }
  return null;
}

// ---------------------------------------------------------------------- runtime

export interface RuntimeInfo {
  port: number;
  token: string;
  pid: number;
  startedAt: string;
}

/** 写 runtime info（正常启动时调用，供 NM host 进程读取） */
export function writeRuntimeInfo(): void {
  const info: RuntimeInfo = {
    port: config.port,
    token: config.token,
    pid: process.pid,
    startedAt: new Date().toISOString(),
  };
  try {
    mkdirSync(config.appDataDir, { recursive: true });
    writeFileSync(RUNTIME_INFO_PATH, JSON.stringify(info), "utf-8");
  } catch (err) {
    console.error("[nm] failed to write runtime info:", err);
  }
}

function readRuntimeInfo(): RuntimeInfo | null {
  try {
    if (!existsSync(RUNTIME_INFO_PATH)) return null;
    return JSON.parse(readFileSync(RUNTIME_INFO_PATH, "utf-8")) as RuntimeInfo;
  } catch {
    return null;
  }
}

// ----------------------------------------------------------------- NM 注册

/**
 * 写 NM host manifest + 注册 HKCU（Chrome/Edge）。正常启动时调用，幂等。
 * manifest.path 指向本 exe；Chrome 据此拉起 NM host（argv 带 chrome-extension://<id>/）。
 */
export function registerNativeMessaging(): void {
  try {
    mkdirSync(config.appDataDir, { recursive: true });
    const allowedOrigins = ALLOWED_EXTENSION_IDS.map((id) => `chrome-extension://${id}/`);
    const manifest = {
      name: NM_HOST_NAME,
      description: "DealPilot Agent",
      path: process.execPath,
      type: "stdio",
      allowed_origins: allowedOrigins,
    };
    writeFileSync(NM_MANIFEST_PATH, JSON.stringify(manifest, null, 2), "utf-8");

    for (const key of REG_KEYS) {
      setRegValue(key, NM_MANIFEST_PATH);
    }
    console.log(`[nm] registered host '${NM_HOST_NAME}' -> ${NM_MANIFEST_PATH}`);
    console.log(`[nm] allowed_origins: ${allowedOrigins.join(", ")}`);
  } catch (err) {
    console.error("[nm] failed to register native messaging:", err);
  }
}

/** reg add "<key>" /ve /d "<value>" /f */
function setRegValue(key: string, value: string): void {
  try {
    Bun.spawnSync(["reg", "add", key, "/ve", "/d", value, "/f"], {
      stdout: "ignore",
      stderr: "ignore",
    });
  } catch {
    // 非 Windows 或 reg 不可用时忽略（注册缺失则扩展无法发现，但不阻断 Agent）
  }
}

// ----------------------------------------------------------------- NM host 协议

/** 从 stdin 读 4 字节小端长度前缀的 JSON 消息（生成器，处理粘包/拆包） */
async function* readMessages(): AsyncGenerator<Record<string, unknown>> {
  let buf = Buffer.alloc(0);
  for await (const chunk of process.stdin) {
    buf = Buffer.concat([buf, chunk as Buffer]);
    while (buf.length >= 4) {
      const len = buf.readUInt32LE(0);
      if (buf.length < 4 + len) break; // 消息不完整，等待更多数据
      const json = buf.subarray(4, 4 + len).toString("utf-8");
      buf = buf.subarray(4 + len);
      try {
        yield JSON.parse(json) as Record<string, unknown>;
      } catch {
        // 跳过畸形消息
      }
    }
  }
}

/** 向 stdout 写 4 字节小端长度前缀的 JSON 消息 */
function writeMessage(obj: unknown): void {
  const json = Buffer.from(JSON.stringify(obj), "utf-8");
  const header = Buffer.allocUnsafe(4);
  header.writeUInt32LE(json.length, 0);
  process.stdout.write(Buffer.concat([header, json]));
}

/**
 * NM host 主循环（Chrome 拉起时执行）：
 * 校验扩展 ID → 读 runtime info → 处理 stdio 消息（hello→auth, refresh_token→token_refresh）
 * stdin 关闭（Chrome 断开）后返回，进程退出。
 */
export async function runNativeMessagingHost(argv: string[]): Promise<void> {
  // 1. 校验调用方扩展 ID
  const extId = extractExtensionId(argv);
  if (!extId || !ALLOWED_EXTENSION_IDS.includes(extId)) {
    writeMessage({ type: "error", error: `extension not allowed: ${extId ?? "(none)"}` });
    return;
  }

  // 2. 读 runtime info（Agent 必须正在运行）
  const info = readRuntimeInfo();
  if (!info) {
    writeMessage({ type: "error", error: "DealPilot Agent not running" });
    return;
  }

  // 3. 处理 stdio 消息直到连接断开
  for await (const msg of readMessages()) {
    switch (msg.type) {
      case "hello":
        writeMessage({ type: "auth", token: info.token, port: info.port });
        break;
      case "refresh_token": {
        // 重新读 runtime info（token 可能随 Agent 重启变化）
        const fresh = readRuntimeInfo() ?? info;
        writeMessage({ type: "token_refresh", token: fresh.token });
        break;
      }
      default:
        // 未知消息忽略
        break;
    }
  }
}
