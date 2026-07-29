import { REMINDER_CHECK_INTERVAL_MS } from "@dealpilot/shared";
import { runMilestoneReminderSweep } from "../services/milestone-service";

let timer: ReturnType<typeof setInterval> | null = null;

async function checkMilestones() {
  try {
    await runMilestoneReminderSweep();
  } catch (error) {
    console.error("[milestone-scheduler] Sweep failed:", error);
  }
}

export function startMilestoneScheduler(): void {
  if (timer) return;
  timer = setInterval(checkMilestones, REMINDER_CHECK_INTERVAL_MS * 5);
  void checkMilestones();
}

export function stopMilestoneScheduler(): void {
  if (!timer) return;
  clearInterval(timer);
  timer = null;
}
