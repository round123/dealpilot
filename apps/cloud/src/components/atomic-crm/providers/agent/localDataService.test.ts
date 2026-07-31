import { ApiError } from "@dealpilot/api-client";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AGENT_TOKEN_STORAGE_KEY, createAgentClient } from "./client";
import { createAgentLocalDataOperations } from "./localDataService";

describe("Agent local data operations", () => {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  };

  beforeEach(() => {
    values.clear();
    values.set(AGENT_TOKEN_STORAGE_KEY, "agent-token");
  });

  it("normalizes invalid inputs without making a request", async () => {
    const fetchImpl = vi.fn();
    const operations = createAgentLocalDataOperations(
      createAgentClient({ fetchImpl: fetchImpl as typeof fetch, storage }),
    );

    await expect(operations.createBackup("short")).rejects.toBeInstanceOf(
      ApiError,
    );
    await expect(operations.createBackup("short")).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
      fields: { password: expect.any(Array) },
    });
    await expect(
      operations.restoreBackup(
        new File(["backup"], "backup.dpbk"),
        "correct-password",
        "wrong",
      ),
    ).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
      fields: { confirmation: ["请输入 RESTORE 确认恢复"] },
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("parses backup validation and only restores with explicit confirmation", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            valid: true,
            integrity_ok: true,
            schema_version: 2,
            app_version: "0.1.0",
          }),
          { headers: { "content-type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ success: true, rows_restored: 8 }),
          { headers: { "content-type": "application/json" } },
        ),
      );
    const operations = createAgentLocalDataOperations(
      createAgentClient({ fetchImpl: fetchImpl as typeof fetch, storage }),
    );
    const file = new File(["backup"], "backup.dpbk");

    await expect(
      operations.validateBackup(file, "correct-password"),
    ).resolves.toMatchObject({ valid: true, integrity_ok: true });
    await expect(
      operations.restoreBackup(file, "correct-password", "RESTORE"),
    ).resolves.toEqual({ success: true, rows_restored: 8 });

    const firstBody = (fetchImpl.mock.calls[0]?.[1] as RequestInit).body;
    expect(firstBody).toBeInstanceOf(FormData);
    expect((firstBody as FormData).get("file")).toBeInstanceOf(File);
    expect((firstBody as FormData).get("password")).toBe("correct-password");
  });

  it("rejects empty or incorrectly typed binary responses", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        new Response("", {
          headers: { "content-type": "application/octet-stream" },
        }),
      )
      .mockResolvedValueOnce(
        new Response("not excel", {
          headers: { "content-type": "text/plain" },
        }),
      );
    const operations = createAgentLocalDataOperations(
      createAgentClient({ fetchImpl: fetchImpl as typeof fetch, storage }),
    );

    await expect(
      operations.createBackup("correct-password"),
    ).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
    await expect(operations.exportAll()).rejects.toMatchObject({
      code: "INVALID_RESPONSE",
    });
  });
});
