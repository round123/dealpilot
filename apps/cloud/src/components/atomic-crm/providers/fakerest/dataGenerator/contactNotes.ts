import { random } from "faker/locale/zh_CN";

import { defaultNoteStatuses } from "../../../root/defaultConfiguration";
import type { ContactNote } from "../../../types";
import type { Db } from "./types";
import { randomDate } from "./utils";

export const generateContactNotes = (db: Db): ContactNote[] => {
  return Array.from(Array(1200).keys()).map((id) => {
    const contact = random.arrayElement(db.contacts);
    const date = randomDate(new Date(contact.first_seen));
    contact.last_seen =
      date > new Date(contact.last_seen)
        ? date.toISOString()
        : contact.last_seen;
    return {
      id,
      contact_id: contact.id,
      text: random.arrayElement([
        "客户希望本周内收到完整报价和交期说明。",
        "已沟通样品规格，等待客户确认收件信息。",
        "采购负责人正在内部评估，约定下周再次联系。",
        "客户关注认证资料和售后条款，已安排补充。",
      ]),
      date: date.toISOString(),
      sales_id: contact.sales_id!,
      status: random.arrayElement(defaultNoteStatuses).value,
    };
  });
};
