import { REMINDER_CHECK_INTERVAL_MS } from "@dealpilot/shared";
import { notify } from "../platform/notifier";
import { runReminderDeliverySweep } from "../services/reminder-service";

let timer: ReturnType<typeof setInterval> | null = null;
let sweepInFlight = false;

async function checkReminders() {
  if (sweepInFlight) return;
  sweepInFlight = true;
  try {
    await runReminderDeliverySweep(notify);
  } catch (error) {
    console.error("[reminder-scheduler] Sweep failed:", error);
  } finally {
    sweepInFlight = false;
  }
}

export function startReminderScheduler(): void {
  if (timer) return;
  timer = setInterval(checkReminders, REMINDER_CHECK_INTERVAL_MS);
  void checkReminders();
}

export function stopReminderScheduler(): void {
  if (!timer) return;
  clearInterval(timer);
  timer = null;
}
