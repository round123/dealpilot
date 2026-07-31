import { REMINDER_CHECK_INTERVAL_MS } from "@dealpilot/shared";
import { notify } from "../platform/notifier";
import { runReminderDeliverySweep } from "../services/reminder-service";

let timer: ReturnType<typeof setInterval> | null = null;
let sweepInFlight = false;

export interface ReminderSchedulerOptions {
  intervalMs?: number;
  sweep?: () => Promise<unknown>;
}

async function checkReminders(sweep: () => Promise<unknown>) {
  if (sweepInFlight) return;
  sweepInFlight = true;
  try {
    await sweep();
  } catch (error) {
    console.error("[reminder-scheduler] Sweep failed:", error);
  } finally {
    sweepInFlight = false;
  }
}

export function startReminderScheduler(options: ReminderSchedulerOptions = {}): void {
  if (timer) return;
  const sweep = options.sweep ?? (() => runReminderDeliverySweep(notify));
  const intervalMs = options.intervalMs ?? REMINDER_CHECK_INTERVAL_MS;
  timer = setInterval(() => void checkReminders(sweep), intervalMs);
  void checkReminders(sweep);
}

export function stopReminderScheduler(): void {
  if (!timer) return;
  clearInterval(timer);
  timer = null;
}
