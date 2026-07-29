import { cleanupExpiredCustomers } from "../services/cleanup-service";

const CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000;
let timer: ReturnType<typeof setInterval> | null = null;

async function runCleanup() {
  try {
    const deleted = await cleanupExpiredCustomers();
    if (deleted > 0) console.log(`[cleanup] Permanently deleted ${deleted} customers`);
  } catch (error) {
    console.error("[cleanup] Error during cleanup:", error);
  }
}

export function startCleanupScheduler(): void {
  if (timer) return;
  timer = setInterval(runCleanup, CLEANUP_INTERVAL_MS);
  setTimeout(runCleanup, 10_000);
}

export function stopCleanupScheduler(): void {
  if (!timer) return;
  clearInterval(timer);
  timer = null;
}
