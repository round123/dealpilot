import type { CustomerFollowUp } from "@dealpilot/api-client";

import { FollowUpCreate } from "./FollowUpCreate";
import { FollowUpEdit } from "./FollowUpEdit";
import { FollowUpList } from "./FollowUpList";

export default {
  list: FollowUpList,
  create: FollowUpCreate,
  edit: FollowUpEdit,
  recordRepresentation: (record: CustomerFollowUp) =>
    record.note ||
    record.message_body ||
    `${record.type} ${record.occurred_at}`,
};

export { FollowUpCreate, FollowUpEdit, FollowUpList };
