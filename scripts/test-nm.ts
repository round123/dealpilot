/**
 * NM host 模拟测试驱动（模拟 Chrome 的 connectNative 行为）
 *
 * 用法: bun scripts/test-nm.ts <exe> <extensionId>
 * 行为：向 exe 传入 chrome-extension://<id>/ argv，stdin 写入 framed {type:"hello"}，
 *       读 stdout 的 framed 响应并打印。stdin EOF 后 host 退出。
 *
 * 期望（白名单 ID）：{"type":"auth","token":"...","port":31081}
 * 期望（非白名单 ID）：{"type":"error","error":"extension not allowed: ..."}
 */

import { spawn } from "node:child_process";
import { Buffer } from "node:buffer";

const exe = process.argv[2];
const extId = process.argv[3];
if (!exe || !extId) {
  console.error("usage: bun scripts/test-nm.ts <exe> <extensionId>");
  process.exit(1);
}

// 构造 4 字节小端长度前缀的 hello 消息
const hello = { type: "hello", extension_version: "0.1.0" };
const json = Buffer.from(JSON.stringify(hello), "utf-8");
const header = Buffer.allocUnsafe(4);
header.writeUInt32LE(json.length, 0);
const frame = Buffer.concat([header, json]);

const child = spawn(exe, [`chrome-extension://${extId}/`], {
  stdio: ["pipe", "pipe", "pipe"],
});

let out = Buffer.alloc(0);
let err = "";
child.stdout.on("data", (d: Buffer) => {
  out = Buffer.concat([out, d]);
});
child.stderr.on("data", (d: Buffer) => {
  err += d.toString("utf-8");
});
child.on("close", (code) => {
  if (out.length >= 4) {
    const len = out.readUInt32LE(0);
    const msg = out.subarray(4, 4 + len).toString("utf-8");
    console.log("RESP:", msg);
  } else {
    console.log("NO RESPONSE (stdout bytes:", out.length, ")");
  }
  if (err.trim()) console.log("STDERR:", err.trim());
  console.log("exit:", code);
});

// 写入 hello 后关闭 stdin（EOF 触发 host 循环结束 → host 退出）
child.stdin.write(frame);
child.stdin.end();
