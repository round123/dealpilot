import { POPUP_REMINDER_LIMIT, ReminderStatus } from "@dealpilot/shared";
import type {
  ReminderCreate,
  ReminderListQuery,
  ReminderStatusUpdate,
} from "@dealpilot/shared";
import { ApiError } from "../errors/api-error";
import {
  findDueReminderDeliveries,
  findDuplicateReminder,
  findReminder,
  findUpcomingReminderDeliveries,
  getPopupReminderCandidates,
  insertReminder,
  listReminderRecords,
  markReminderNotified,
  markReminderOverdue,
  updateReminderRecord,
} from "../repositories/reminder-repository";
import { toCursorPage } from "./pagination";
import { sortPopupReminderCandidates } from "./reminder-priority";

export type NotificationSender = (notification: {
  title: string;
  message: string;
  sound: boolean;
}) => Promise<void>;

interface DeliveryItem {
  reminder: { id: string; last_notified_at: string | null };
  customerName: string;
}

export interface ReminderDeliveryStore {
  findDue(now: string): Promise<DeliveryItem[]>;
  findUpcoming(now: string, windowEnd: string): Promise<DeliveryItem[]>;
  markOverdue(reminderId: string, notifiedAt: string | null): Promise<unknown>;
  markNotified(reminderId: string, notifiedAt: string): Promise<unknown>;
}

const defaultDeliveryStore: ReminderDeliveryStore = {
  findDue: findDueReminderDeliveries,
  findUpcoming: findUpcomingReminderDeliveries,
  markOverdue: markReminderOverdue,
  markNotified: markReminderNotified,
};

export async function listReminders(query: ReminderListQuery) {
  const rows = await listReminderRecords(query);
  return toCursorPage(rows.map(({ reminder }) => reminder), query.limit);
}

export async function createReminder(input: ReminderCreate) {
  if (await findDuplicateReminder(input)) {
    throw ApiError.conflict("Duplicate reminder already exists");
  }
  return insertReminder(input);
}

export async function updateReminderStatus(reminderId: string, update: ReminderStatusUpdate) {
  const reminder = await findReminder(reminderId);
  if (!reminder) throw ApiError.notFound("Reminder not found");
  if (update.status === ReminderStatus.SNOOZED && !update.snooze_until) {
    throw ApiError.badRequest("snooze_until is required when snoozing a reminder");
  }

  const status = update.status === ReminderStatus.REPLIED
    ? ReminderStatus.PENDING
    : update.status;
  const now = new Date().toISOString();
  const isHandled = status === ReminderStatus.COMPLETED ||
    status === ReminderStatus.SNOOZED ||
    status === ReminderStatus.IGNORED;
  const updates: Parameters<typeof updateReminderRecord>[1] = {
    status,
    ...(isHandled ? { handled_at: reminder.handled_at ?? now } : {}),
    completed_at: status === ReminderStatus.COMPLETED
      ? reminder.completed_at ?? now
      : null,
    ...(update.status === ReminderStatus.SNOOZED
      ? { snooze_until: update.snooze_until, last_notified_at: null }
      : { snooze_until: null }),
  };
  if (update.resolution !== undefined) updates.resolution = update.resolution;
  if (update.status === ReminderStatus.REPLIED) {
    updates.resolution = update.resolution ?? "Customer reply received";
  }
  return updateReminderRecord(reminderId, updates, now);
}

export async function getPopupReminders(now: Date = new Date()) {
  const candidates = await getPopupReminderCandidates(now.toISOString());
  return sortPopupReminderCandidates(candidates, now)
    .slice(0, POPUP_REMINDER_LIMIT)
    .map(({
      reminder,
      customerName,
      projectName,
      hasHighRisk,
      conversationPlatform,
      conversationIdentifier,
    }) => ({
      ...reminder,
      customer_name: customerName,
      project_name: projectName,
      has_high_risk: Boolean(hasHighRisk),
      conversation_target: conversationPlatform && conversationIdentifier
        ? {
            platform: conversationPlatform as "whatsapp" | "telegram",
            raw_identifier: conversationIdentifier,
          }
        : null,
    }));
}

export async function runReminderDeliverySweep(
  sendNotification: NotificationSender,
  now: Date = new Date(),
  store: ReminderDeliveryStore = defaultDeliveryStore,
) {
  const nowIso = now.toISOString();
  const windowEnd = new Date(now.getTime() + 5 * 60 * 1000).toISOString();
  const result = { due: 0, upcoming: 0, failed: 0 };

  for (const { reminder, customerName } of await store.findDue(nowIso)) {
    try {
      if (!reminder.last_notified_at) {
        await sendNotification({
          title: "DealPilot 提醒",
          message: `${customerName} - 提醒已到期`,
          sound: true,
        });
      }
      await store.markOverdue(reminder.id, reminder.last_notified_at ? null : nowIso);
      result.due++;
    } catch (error) {
      result.failed++;
      console.error("[reminder-service] Due reminder delivery failed:", error);
    }
  }

  for (const { reminder, customerName } of await store.findUpcoming(nowIso, windowEnd)) {
    try {
      await sendNotification({
        title: "DealPilot 提醒",
        message: `${customerName} - 提醒即将到期`,
        sound: true,
      });
      await store.markNotified(reminder.id, nowIso);
      result.upcoming++;
    } catch (error) {
      result.failed++;
      console.error("[reminder-service] Upcoming notification failed:", error);
    }
  }

  return result;
}
