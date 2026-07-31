import type { CustomerReminder } from "@dealpilot/api-client";

import { ReminderCreate } from "./ReminderCreate";
import { ReminderList } from "./ReminderList";

export default {
  list: ReminderList,
  create: ReminderCreate,
  recordRepresentation: (record: CustomerReminder) =>
    `${record.type} ${record.due_at}`,
};

export { ReminderCreate, ReminderList };
