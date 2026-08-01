import { describe, expect, it, vi } from "vitest";

import { ApiError } from "../src/error.js";
import { createImportApi } from "../src/import.js";

const jobId = "10000000-0000-4000-8000-000000000001";
const payloadHash = "a".repeat(64);

describe("cloud import API", () => {
  it("commits one validated payload through the transactional RPC", async () => {
    const rpc = vi.fn(async (_name, _args, schema) =>
      schema.parse({
        success: 1,
        failed: 0,
        skipped: 0,
        duplicates: 0,
        warnings: [],
      }),
    );
    const imports = createImportApi({ rpc });
    const signal = new AbortController().signal;

    await expect(
      imports.commit(
        {
          jobId,
          idempotencyKey: "import-1",
          payloadHash,
          rows: [row(1)],
          resolutions: [],
          invalidCount: 0,
        },
        { signal },
      ),
    ).resolves.toEqual({
      success: 1,
      failed: 0,
      skipped: 0,
      duplicates: 0,
      warnings: [],
    });
    expect(rpc).toHaveBeenCalledWith(
      "commit_customer_import",
      {
        p_job_id: jobId,
        p_idempotency_key: "import-1",
        p_payload_hash: payloadHash,
        p_rows: [row(1)],
        p_resolutions: [],
        p_invalid_count: 0,
      },
      expect.anything(),
      { signal },
    );
  });

  it("rejects oversized input before making a request", async () => {
    const rpc = vi.fn();
    const imports = createImportApi({ rpc });

    await expect(
      imports.commit({
        jobId,
        idempotencyKey: "import-oversized",
        payloadHash,
        rows: Array.from({ length: 1_001 }, (_, index) => row(index + 1)),
        resolutions: [],
        invalidCount: 0,
      }),
    ).rejects.toBeInstanceOf(ApiError);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("rejects malformed successful responses at the boundary", async () => {
    const imports = createImportApi({
      rpc: vi.fn(async (_name, _args, schema) =>
        schema.parse({ success: "one" }),
      ),
    });

    await expect(
      imports.commit({
        jobId,
        idempotencyKey: "import-invalid-response",
        payloadHash,
        rows: [row(1)],
        resolutions: [],
        invalidCount: 0,
      }),
    ).rejects.toThrow();
  });
});

const row = (rowIndex: number) => ({
  row_index: rowIndex,
  name: `客户 ${rowIndex}`,
  company: null,
  country: null,
  source: null,
  grade: "B" as const,
  contact_name: null,
  email: null,
  phone: null,
  platform: null,
  platform_account: null,
});
