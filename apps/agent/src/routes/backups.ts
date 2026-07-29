/**
 * DealPilot 路由 - Backups
 * POST /backups/create, POST /backups/validate, POST /backups/restore
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { BackupCreateSchema } from "@dealpilot/shared";
import {
  createBackup,
  validateBackup,
  restoreBackup,
} from "../services/backup-service";

const app = new Hono();

// 全局互斥锁（恢复操作期间拒绝其他写请求）
let restoreLock = false;

// POST /backups/create - 创建加密备份
app.post("/backups/create", zValidator("json", BackupCreateSchema), async (c) => {
  const body = c.req.valid("json");
  const backupBuffer = await createBackup(body.password);

  c.header("Content-Type", "application/octet-stream");
  c.header(
    "Content-Disposition",
    `attachment; filename="dealpilot-backup-${Date.now()}.dpbk"`,
  );
  return c.body(backupBuffer);
});

// POST /backups/validate - 校验备份完整性和兼容性
app.post("/backups/validate", async (c) => {
  const formData = await c.req.formData();
  const file = formData.get("file") as File;
  const password = formData.get("password") as string;

  if (!file || !password) {
    return c.json(
      {
        error: {
          code: "BAD_REQUEST",
          message: "Missing file or password",
        },
      },
      400,
    );
  }

  const fileBuffer = Buffer.from(await file.arrayBuffer());
  const result = validateBackup(fileBuffer, password);
  return c.json(result);
});

// POST /backups/restore - 恢复备份（全局互斥锁）
app.post("/backups/restore", async (c) => {
  if (restoreLock) {
    return c.json(
      {
        error: {
          code: "CONFLICT",
          message: "Restore operation in progress",
        },
      },
      409,
    );
  }

  restoreLock = true;
  try {
    const formData = await c.req.formData();
    const file = formData.get("file") as File;
    const password = formData.get("password") as string;

    if (!file || !password) {
      return c.json(
        {
          error: {
            code: "BAD_REQUEST",
            message: "Missing file or password",
          },
        },
        400,
      );
    }

    const fileBuffer = Buffer.from(await file.arrayBuffer());
    const result = await restoreBackup(fileBuffer, password);
    return c.json(result);
  } finally {
    restoreLock = false;
  }
});

export default app;
