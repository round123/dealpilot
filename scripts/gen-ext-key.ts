/**
 * 生成 Chrome 扩展稳定 key + 推算扩展 ID
 *
 * Chrome 扩展 ID 算法：SHA-1(key 字段 base64 解码后的 DER 字节) 取前 16 字节，
 * 每 4 bit (0-15) 映射到 a-p，拼成 32 字母 ID。
 *
 * 用法: bun scripts/gen-ext-key.ts
 * 产物: KEY (写入 wxt.config manifest.key) + ID (写入 agent 白名单 / allowed_origins)
 */

import { generateKeyPairSync, createHash } from "node:crypto";

const { publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const spkiDer = publicKey.export({ format: "der", type: "spki" });
const keyB64 = Buffer.from(spkiDer).toString("base64");

const sha1hex = createHash("sha1").update(spkiDer).digest("hex");
const id = sha1hex
  .slice(0, 32)
  .split("")
  .map((h) => String.fromCharCode(97 + parseInt(h, 16)))
  .join("");

console.log("KEY (写入 manifest.key):");
console.log(keyB64);
console.log("\nEXTENSION_ID (写入 agent 白名单):");
console.log(id);
