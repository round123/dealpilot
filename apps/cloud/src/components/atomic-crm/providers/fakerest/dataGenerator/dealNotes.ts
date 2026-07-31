import { random } from "faker/locale/zh_CN";

import type { Db } from "./types";
import { randomDate } from "./utils";

export const generateDealNotes = (db: Db) => {
  return Array.from(Array(300).keys()).map((id) => {
    const deal = random.arrayElement(db.deals);
    return {
      id,
      deal_id: deal.id,
      text: random.arrayElement([
        "报价版本已更新，等待客户确认付款条件。",
        "项目规格基本确定，需继续核对包装和运输方案。",
        "客户内部审批延后，下周跟进最终决策时间。",
        "样品测试通过，准备进入合同条款沟通。",
      ]),
      date: randomDate(
        new Date(db.deals[deal.id as number].created_at),
      ).toISOString(),
      sales_id: deal.sales_id,
    };
  });
};
