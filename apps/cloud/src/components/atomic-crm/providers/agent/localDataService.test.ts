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
    await expect(operations.clearData("CLEAR")).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
      fields: { confirmation: ["请输入 CLEAR ALL DATA 确认清空"] },
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("parses lifecycle data and sends the exact clear confirmation", async () => {
    const info = {
      data_path: "C:\\DealPilot\\data\\dealpilot.db",
      database_size_bytes: 4096,
      occupied_size_bytes: 8192,
      recovery_size_bytes: 16384,
      last_backup_at: null,
      backup_reminder_days: 7,
      backup_recommendation: "first_import",
      has_business_data: true,
      auto_start_supported: false,
    };
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify(info), {
          headers: { "content-type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: true,
            deleted_records: 12,
            cleared_at: "2026-07-31T04:00:00.000Z",
            external_backups_preserved: true,
          }),
          { headers: { "content-type": "application/json" } },
        ),
      );
    const operations = createAgentLocalDataOperations(
      createAgentClient({ fetchImpl: fetchImpl as typeof fetch, storage }),
    );

    await expect(operations.getInfo()).resolves.toEqual(info);
    await expect(operations.clearData("CLEAR ALL DATA")).resolves.toMatchObject(
      {
        success: true,
        deleted_records: 12,
      },
    );
    expect(
      JSON.parse(String((fetchImpl.mock.calls[1]?.[1] as RequestInit).body)),
    ).toEqual({ confirmation: "CLEAR ALL DATA" });
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
        new Response(JSON.stringify({ success: true, rows_restored: 8 }), {
          headers: { "content-type": "application/json" },
        }),
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

  it("parses rolling metrics and downloads the anonymized report", async () => {
    const rolling = {
      window_days: 30,
      window_start: "2026-07-01T00:00:00.000Z",
      window_end: "2026-07-31T00:00:00.000Z",
      on_time_completion: {
        numerator: 18,
        denominator: 20,
        rate: 0.9,
        target: 0.9,
        minimum_sample: 20,
      },
      match_accuracy: {
        numerator: 19,
        denominator: 20,
        rate: 0.95,
        target: 0.95,
      },
      reminder_handling: {
        numerator: 9,
        denominator: 10,
        rate: 0.9,
        target: 0.9,
      },
    };
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        total_customers: 0,
        total_followups: 0,
        total_reminders: 0,
        pending_reminders: 0,
        overdue_reminders: 0,
        total_projects: 0,
        active_projects: 0,
        completion_rate: 0,
        rolling_30_days: rolling,
      })))
      .mockResolvedValueOnce(new Response("{}", {
        headers: { "content-type": "application/json" },
      }));
    const operations = createAgentLocalDataOperations(
      createAgentClient({ fetchImpl: fetchImpl as typeof fetch, storage }),
    );

    await expect(operations.getUsageMetrics()).resolves.toEqual(rolling);
    await expect(operations.exportUsageMetrics()).resolves.toBeInstanceOf(Blob);
    expect(String(fetchImpl.mock.calls[1]?.[0])).toContain("/api/v1/stats/export");
  });
});
