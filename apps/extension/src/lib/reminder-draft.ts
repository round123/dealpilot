import {
  ReminderCreateSchema,
  ReminderType,
  type ReminderCreate,
} from "@dealpilot/shared";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export interface ReminderDraft {
  customerId: string;
  projectId?: string;
  type: ReminderCreate["type"];
  priority: ReminderCreate["priority"];
  dueAt: string;
  pauseReason: string;
  reevaluateAt: string;
}

export function buildReminderCreate(
  draft: ReminderDraft,
  now = new Date(),
): ReminderCreate {
  const common = {
    customer_id: draft.customerId,
    project_id: draft.projectId,
    type: draft.type,
    priority: draft.priority,
  };

  if (draft.type === ReminderType.PAUSED) {
    return ReminderCreateSchema.parse({
      ...common,
      pause_reason: draft.pauseReason.trim(),
      reevaluate_at: draft.reevaluateAt
        ? new Date(draft.reevaluateAt).toISOString()
        : undefined,
    });
  }

  return ReminderCreateSchema.parse({
    ...common,
    due_at: draft.type === ReminderType.FIXED_TIME
      ? new Date(draft.dueAt).toISOString()
      : new Date(now.getTime() + ONE_DAY_MS).toISOString(),
  });
}
