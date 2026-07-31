import { createHash } from "node:crypto";
import { getRawDb } from "../db/client";

const AUTO_MATCH_EVENT = "match.auto_resolved";
const MATCH_CORRECTION_EVENT = "match.auto_corrected";

export interface RollingUsageMetricCounts {
  windowStart: string;
  windowEnd: string;
  onTimeCompleted: number;
  dueReminders: number;
  correctAutomaticMatches: number;
  automaticMatches: number;
  handledReminders: number;
  deliveredReminders: number;
}

export function getRollingUsageMetricCounts(
  now: Date = new Date(),
): RollingUsageMetricCounts {
  const windowEnd = now.toISOString();
  const windowStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
    .toISOString();
  const raw = getRawDb();

  const reminderCounts = raw.query(`
    SELECT
      COUNT(*) AS due_reminders,
      COALESCE(SUM(CASE
        WHEN status = 'completed'
          AND julianday(updated_at) <= julianday(due_at, '+24 hours')
        THEN 1 ELSE 0 END), 0) AS on_time_completed
    FROM reminders
    WHERE due_at >= ? AND due_at <= ?
  `).get(windowStart, windowEnd) as {
    due_reminders: number;
    on_time_completed: number;
  };

  const handlingCounts = raw.query(`
    SELECT
      COUNT(*) AS delivered_reminders,
      COALESCE(SUM(CASE
        WHEN status IN ('completed', 'ignored') OR snooze_until IS NOT NULL
        THEN 1 ELSE 0 END), 0) AS handled_reminders
    FROM reminders
    WHERE last_notified_at >= ? AND last_notified_at <= ?
  `).get(windowStart, windowEnd) as {
    delivered_reminders: number;
    handled_reminders: number;
  };

  const matchCounts = raw.query(`
    SELECT
      COUNT(*) AS automatic_matches,
      COALESCE(SUM(CASE WHEN EXISTS (
        SELECT 1 FROM local_events correction
        WHERE correction.event_type = ?
          AND correction.entity_id = automatic.entity_id
          AND correction.occurred_at >= ?
          AND correction.occurred_at <= ?
      ) THEN 1 ELSE 0 END), 0) AS corrected_matches
    FROM local_events automatic
    WHERE automatic.event_type = ?
      AND automatic.occurred_at >= ?
      AND automatic.occurred_at <= ?
  `).get(
    MATCH_CORRECTION_EVENT,
    windowStart,
    windowEnd,
    AUTO_MATCH_EVENT,
    windowStart,
    windowEnd,
  ) as { automatic_matches: number; corrected_matches: number };

  return {
    windowStart,
    windowEnd,
    onTimeCompleted: Number(reminderCounts.on_time_completed),
    dueReminders: Number(reminderCounts.due_reminders),
    correctAutomaticMatches:
      Number(matchCounts.automatic_matches) - Number(matchCounts.corrected_matches),
    automaticMatches: Number(matchCounts.automatic_matches),
    handledReminders: Number(handlingCounts.handled_reminders),
    deliveredReminders: Number(handlingCounts.delivered_reminders),
  };
}

export function recordAutomaticMatchObservation(
  platform: string,
  normalizedIdentifier: string,
  customerId: string,
  occurredAt = new Date().toISOString(),
): void {
  upsertConversationEvent(
    AUTO_MATCH_EVENT,
    conversationHash(platform, normalizedIdentifier),
    occurredAt,
    JSON.stringify({ matched_customer_hash: sensitiveValueHash(customerId) }),
  );
}

export function recordAutomaticMatchCorrection(
  platform: string,
  normalizedIdentifier: string,
  customerId: string,
  occurredAt = new Date().toISOString(),
): void {
  const hash = conversationHash(platform, normalizedIdentifier);
  const raw = getRawDb();
  const automatic = raw.query(`
    SELECT metadata FROM local_events
    WHERE event_type = ? AND entity_id = ?
    LIMIT 1
  `).get(AUTO_MATCH_EVENT, hash) as { metadata: string | null } | null;
  if (!automatic) return;

  const originalCustomerHash = parseMatchedCustomerHash(automatic.metadata);
  if (originalCustomerHash === sensitiveValueHash(customerId)) return;
  upsertConversationEvent(MATCH_CORRECTION_EVENT, hash, occurredAt);
}

function upsertConversationEvent(
  eventType: string,
  entityId: string,
  occurredAt: string,
  metadata: string | null = null,
): void {
  const raw = getRawDb();
  const existing = raw.query(`
    SELECT id FROM local_events
    WHERE event_type = ? AND entity_id = ?
    LIMIT 1
  `).get(eventType, entityId) as { id: string } | null;

  if (existing) {
    raw.query("UPDATE local_events SET occurred_at = ?, metadata = ? WHERE id = ?")
      .run(occurredAt, metadata, existing.id);
    return;
  }
  raw.query(`
    INSERT INTO local_events (
      id, event_type, entity_type, entity_id, metadata, occurred_at
    ) VALUES (?, ?, 'conversation_hash', ?, ?, ?)
  `).run(crypto.randomUUID(), eventType, entityId, metadata, occurredAt);
}

function conversationHash(platform: string, normalizedIdentifier: string) {
  return sensitiveValueHash(`${platform}:${normalizedIdentifier}`);
}

function sensitiveValueHash(value: string) {
  return createHash("sha256")
    .update(value)
    .digest("hex");
}

function parseMatchedCustomerHash(metadata: string | null): string | null {
  if (!metadata) return null;
  try {
    const parsed = JSON.parse(metadata) as { matched_customer_hash?: unknown };
    return typeof parsed.matched_customer_hash === "string"
      ? parsed.matched_customer_hash
      : null;
  } catch {
    return null;
  }
}
