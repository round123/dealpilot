import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

test("bulk resource endpoints support stable cursor pagination and parent filters", async () => {
  const temporaryRoot = resolve(
    await mkdtemp(join(tmpdir(), "dealpilot-agent-bulk-list-")),
  );
  if (!temporaryRoot.startsWith(resolve(tmpdir()))) {
    throw new Error(`Refusing to use unexpected temp path: ${temporaryRoot}`);
  }

  try {
    const runner = join(
      import.meta.dir,
      "helpers",
      "bulk-resource-list-runner.ts",
    );
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

    for (const page of Object.values(result.empty) as any[]) {
      expect(page).toEqual({ items: [], next_cursor: null });
    }

    expect(result.invalid_limit).toMatchObject({
      status: 400,
      body: {
        error: {
          code: "VALIDATION_ERROR",
          message: "Request validation failed",
          fields: { limit: expect.any(Array) },
          request_id: expect.any(String),
        },
      },
    });

    expect(result.pages.contacts.items).toHaveLength(3);
    expect(result.pages.social_accounts.items).toHaveLength(2);
    expect(result.pages.risks.items).toHaveLength(3);
    expect(result.pages.milestones.items).toHaveLength(2);

    for (const pageSet of Object.values(result.pages) as any[]) {
      const ids = pageSet.items.map((item: any) => item.id);
      expect(ids).toEqual([...ids].sort());
      expect(new Set(ids).size).toBe(ids.length);
      expect(pageSet.cursors.at(-1)).toBeNull();
      expect(pageSet.cursors.slice(0, -1).every(Boolean)).toBe(true);
    }

    expect(result.filtered.contacts.items).toHaveLength(2);
    expect(
      result.filtered.contacts.items.every(
        (item: any) => item.customer_id === result.parent_ids.customer_one,
      ),
    ).toBe(true);
    expect(result.filtered.social_accounts.items).toHaveLength(1);
    expect(result.filtered.social_accounts.items[0].customer_id).toBe(
      result.parent_ids.customer_two,
    );
    expect(result.filtered.risks.items).toHaveLength(2);
    expect(
      result.filtered.risks.items.every(
        (item: any) => item.project_id === result.parent_ids.project_one,
      ),
    ).toBe(true);
    expect(result.filtered.milestones.items).toHaveLength(1);
    expect(result.filtered.milestones.items[0].project_id).toBe(
      result.parent_ids.project_two,
    );
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}, 30_000);
