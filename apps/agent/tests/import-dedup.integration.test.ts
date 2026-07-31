import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

test("uses stable identifiers for import duplicates and previews safe merges", async () => {
  const temporaryRoot = resolve(
    await mkdtemp(join(tmpdir(), "dealpilot-import-dedup-")),
  );
  if (!temporaryRoot.startsWith(resolve(tmpdir()))) {
    throw new Error(`Refusing to use unexpected temp path: ${temporaryRoot}`);
  }

  try {
    const runner = join(import.meta.dir, "helpers", "import-dedup-runner.ts");
    const child = Bun.spawn([process.execPath, "run", runner], {
      cwd: join(import.meta.dir, ".."),
      env: { ...Bun.env, DEALPILOT_DATA_DIR: temporaryRoot },
      stdout: "pipe",
      stderr: "pipe",
    });
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    expect(exitCode, stderr).toBe(0);
    const result = JSON.parse(stdout.trim().split(/\r?\n/).at(-1)!);

    expect(result).toEqual({
      parse_status: 200,
      stale_parse_status: 200,
      forged_target_status: 400,
      stale_commit_status: 409,
      jobs_after_stale_commit: 0,
      duplicate_rows: 1,
      matched_by: ["email", "phone", "platform_account"],
      conflict_fields: ["name", "company", "country", "grade", "contact_name"],
      hint_rows: 1,
      hint_matched_by: ["name", "company"],
      commit_status: 200,
      success: 1,
      duplicates: 1,
      preserved_name: "现有客户",
      preserved_company: "现有公司",
      preserved_country: "中国",
      filled_source: "展会",
      preserved_contact_name: "现有联系人",
      created_hint_only_customer: true,
      platform_new_status: 200,
      platform_new_success: 1,
      platform_new_contacts: 1,
      platform_new_accounts: 0,
      platform_new_warning: {
        code: "PLATFORM_ACCOUNT_NOT_COPIED",
        row_index: 1,
        field: "platform_account",
        platform: "telegram",
        platform_account: "@buyer",
        existing_customer_id: "11111111-1111-4111-8111-111111111111",
      },
    });
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});
