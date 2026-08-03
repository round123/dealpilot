import {
  ReminderStatus,
  ReminderStatusUpdateSchema,
  type ReminderStatusUpdate,
} from "@dealpilot/shared";

export type ReminderAction =
  | "complete"
  | "snooze"
  | "ignore"
  | "reply_received";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export interface ReminderActionAttempt {
  action: ReminderAction;
  idempotencyKey: string;
  update: ReminderStatusUpdate;
}

export function createReminderActionAttemptStore(
  generateKey: () => string = () => crypto.randomUUID(),
) {
  const attempts = new Map<string, ReminderActionAttempt>();
  const attemptId = (reminderId: string, action: ReminderAction) =>
    `${reminderId}:${action}`;

  return {
    get(
      reminderId: string,
      action: ReminderAction,
      now = new Date(),
    ): ReminderActionAttempt {
      const id = attemptId(reminderId, action);
      const existing = attempts.get(id);
      if (existing) return existing;
      const attempt = {
        action,
        idempotencyKey: generateKey(),
        update: buildReminderStatusUpdate(action, now),
      };
      attempts.set(id, attempt);
      return attempt;
    },
    complete(reminderId: string, action: ReminderAction): void {
      attempts.delete(attemptId(reminderId, action));
    },
  };
}

export function buildReminderStatusUpdate(
  action: ReminderAction,
  now = new Date(),
): ReminderStatusUpdate {
  switch (action) {
    case "complete":
      return ReminderStatusUpdateSchema.parse({ status: ReminderStatus.COMPLETED });
    case "snooze":
      return ReminderStatusUpdateSchema.parse({
        status: ReminderStatus.SNOOZED,
        snooze_until: new Date(now.getTime() + ONE_DAY_MS).toISOString(),
      });
    case "ignore":
      return ReminderStatusUpdateSchema.parse({ status: ReminderStatus.IGNORED });
    case "reply_received":
      return ReminderStatusUpdateSchema.parse({ status: ReminderStatus.REPLIED });
  }
}
