import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

test("computes rolling local metrics and exports only anonymized aggregates", async () => {
  const temporaryRoot = resolve(await mkdtemp(join(tmpdir(), "dealpilot-metrics-")));
  if (!temporaryRoot.startsWith(resolve(tmpdir()))) {
    throw new Error(`Refusing unexpected temporary path: ${temporaryRoot}`);
  }

  try {
    const runner = join(import.meta.dir, "helpers", "usage-metrics-runner.ts");
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

    expect(result.beforeCorrection.on_time_completion).toMatchObject({
      numerator: 1,
      denominator: 4,
      minimum_sample: 20,
    });
    expect(result.beforeCorrection.match_accuracy).toMatchObject({
      numerator: 0,
      denominator: 0,
      rate: null,
    });
    expect(result.afterSameTargetBind.match_accuracy).toMatchObject({
      numerator: 1,
      denominator: 1,
      rate: 1,
    });
    expect(result.afterCorrection.match_accuracy).toMatchObject({
      numerator: 0,
      denominator: 1,
      rate: 0,
    });
    expect(result.afterCorrection.reminder_handling).toMatchObject({
      numerator: 3,
      denominator: 4,
      rate: 0.75,
    });
    expect(result.snoozedReminder).toMatchObject({
      last_notified_at: null,
      delivered_at: result.snoozedDeliveredAt,
      handled_at: expect.any(String),
    });

    expect(result.report).toMatchObject({
      report_type: "dealpilot_anonymized_usage_metrics",
      local_only: true,
      contains_customer_identity: false,
      contains_message_content: false,
    });
    expect(result.exportStatus).toBe(200);
    expect(result.exportContentType).toContain("application/json");
    expect(result.exportDisposition).toContain("attachment");
    expect(result.exportText).not.toContain(result.observedIdentifier);
    expect(result.exportText).not.toContain(result.customerA);
    expect(result.exportText).not.toContain(result.customerB);
    expect(result.exportText).not.toContain(result.privateCustomerName);
    expect(result.exportText).not.toContain(result.privateMessage);
    expect(result.report.methodology.match_accuracy).toContain("明确确认");
    expect(result.report.methodology.match_accuracy).toContain("未评价的自动匹配不进入分母");
    expect(result.report.methodology.reminder_handling).toContain(
      "稍后到期重新进入待处理状态仍保留本次处理计数",
    );

    expect(result.events).toHaveLength(2);
    expect(result.events.map((event: any) => event.event_type)).toEqual([
      "match.auto_corrected",
      "match.auto_resolved",
    ]);
    expect(result.events.every((event: any) =>
      event.entity_type === "conversation_hash" && event.entity_id.length === 64
    )).toBe(true);
    expect(JSON.stringify(result.events)).not.toContain(result.observedIdentifier);
    expect(JSON.stringify(result.events)).not.toContain(result.customerA);
    expect(JSON.stringify(result.events)).not.toContain(result.customerB);
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}, 15_000);
