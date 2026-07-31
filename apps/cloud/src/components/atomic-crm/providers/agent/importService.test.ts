import { ApiError } from "@dealpilot/api-client";
import { describe, expect, it, vi } from "vitest";

import type { AgentClient } from "./client";
import { createAgentImportOperations } from "./importService";

const jobId = "11111111-1111-4111-8111-111111111111";
const customerId = "22222222-2222-4222-8222-222222222222";

function createClient() {
  const postForm = vi.fn(
    async (
      _path: string,
      body: FormData,
      parser: { parse(value: unknown): unknown },
    ) => {
      expect(body.get("file")).toBeInstanceOf(File);
      expect(JSON.parse(String(body.get("mapping")))).toEqual({
        name: "客户简称",
        email: "采购邮箱",
      });
      return parser.parse({
        job_id: jobId,
        total_rows: 2,
        valid_rows: 1,
        errors: [{ row: 2, field: "name", message: "客户名称不能为空" }],
        duplicate_candidates: [
          {
            row_index: 1,
            existing_customer_id: customerId,
            existing_name: "现有客户",
            new_name: "导入客户",
          },
        ],
        source_columns: ["客户简称", "采购邮箱"],
        preview: [{ name: "导入客户", email: "buyer@example.com" }],
      });
    },
  );
  const post = vi.fn(
    async (
      _path: string,
      _body: unknown,
      parser: { parse(value: unknown): unknown },
    ) => parser.parse({ success: 0, failed: 1, skipped: 0, duplicates: 1 }),
  );
  const getBlob = vi.fn(
    async (_path: string, parser: { parse(value: unknown): unknown }) =>
      parser.parse(new Blob(["row,field,message"], { type: "text/csv" })),
  );
  return {
    client: { postForm, post, getBlob } as unknown as AgentClient,
    postForm,
    post,
    getBlob,
  };
}

describe("Agent import operations", () => {
  it("parses multipart files and runtime-parses all responses", async () => {
    const { client, postForm, post, getBlob } = createClient();
    const operations = createAgentImportOperations(client);
    const file = new File(
      ["名称,邮箱\n导入客户,buyer@example.com"],
      "客户.csv",
      {
        type: "text/csv",
      },
    );

    const parsed = await operations.parseFile(file, {
      mapping: { name: "客户简称", email: "采购邮箱" },
    });
    expect(parsed).toMatchObject({
      job_id: jobId,
      total_rows: 2,
      valid_rows: 1,
    });
    expect(postForm).toHaveBeenCalledWith(
      "imports/parse",
      expect.any(FormData),
      expect.anything(),
      { signal: undefined },
    );

    const committed = await operations.commit(
      {
        job_id: jobId,
        resolutions: [
          {
            row_index: 1,
            action: "merge",
            target_customer_id: customerId,
          },
        ],
      },
      { idempotencyKey: "commit-1" },
    );
    expect(committed.duplicates).toBe(1);
    expect(post).toHaveBeenCalledWith(
      `imports/${jobId}/commit`,
      expect.objectContaining({ job_id: jobId }),
      expect.anything(),
      { idempotencyKey: "commit-1" },
    );

    const report = await operations.downloadErrors(jobId);
    expect(report.type).toBe("text/csv");
    expect(getBlob).toHaveBeenCalledWith(
      `imports/${jobId}/errors`,
      expect.anything(),
      undefined,
    );
  });

  it("normalizes malformed commit inputs instead of leaking Zod errors", async () => {
    const { client, post, getBlob } = createClient();
    const operations = createAgentImportOperations(client);

    await expect(
      operations.commit({ job_id: "not-a-uuid", resolutions: [] } as never),
    ).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
      status: 400,
      fields: { job_id: expect.any(Array) },
    });
    await expect(operations.downloadErrors("bad-id")).rejects.toBeInstanceOf(
      ApiError,
    );
    expect(post).not.toHaveBeenCalled();
    expect(getBlob).not.toHaveBeenCalled();
  });

  it("normalizes invalid and duplicate mappings before transport", async () => {
    const { client, postForm } = createClient();
    const operations = createAgentImportOperations(client);
    const file = new File(["客户列\n华东贸易"], "客户.csv");

    await expect(
      operations.parseFile(file, { mapping: { email: "客户列" } as never }),
    ).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
      fields: { "mapping.name": expect.any(Array) },
    });
    await expect(
      operations.parseFile(file, {
        mapping: { name: "客户列", company: "客户列" },
      }),
    ).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
      fields: { "mapping.company": expect.any(Array) },
    });
    expect(postForm).not.toHaveBeenCalled();
  });
});
