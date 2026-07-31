import { afterEach, describe, expect, test } from "bun:test";
import {
  startReminderScheduler,
  stopReminderScheduler,
} from "../src/scheduler/reminder-scheduler";

afterEach(() => stopReminderScheduler());

describe("reminder scheduler", () => {
  test("runs a catch-up sweep immediately on startup", async () => {
    let calls = 0;
    startReminderScheduler({
      intervalMs: 60_000,
      sweep: async () => { calls++; },
    });

    await Bun.sleep(0);
    expect(calls).toBe(1);
  });

  test("does not overlap interval sweeps", async () => {
    let calls = 0;
    let releaseFirst!: () => void;
    const firstSweep = new Promise<void>((resolve) => { releaseFirst = resolve; });
    startReminderScheduler({
      intervalMs: 5,
      sweep: async () => {
        calls++;
        if (calls === 1) await firstSweep;
      },
    });

    await Bun.sleep(20);
    expect(calls).toBe(1);
    releaseFirst();
    await Bun.sleep(10);
    expect(calls).toBeGreaterThanOrEqual(2);
  });
});
