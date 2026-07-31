import {
  address,
  datatype,
  internet,
  phone,
  random,
} from "faker/locale/zh_CN";

import { randomDate } from "./utils";
import { defaultCompanySectors } from "../../../root/defaultConfiguration";
import type { Company, RAFile } from "../../../types";
import type { Db } from "./types";

const sizes = [1, 10, 50, 250, 500];

const regex = /\W+/;
const COMPANY_NAMES = [
  "深圳远航贸易",
  "宁波海拓供应链",
  "广州新越家居",
  "苏州启明工业",
  "东莞卓成电子",
  "青岛海川机械",
  "厦门联盛进出口",
  "杭州云帆科技",
  "佛山优品建材",
  "义乌星联商贸",
  "上海汇达医疗",
  "无锡精工装备",
];
const COMPANY_DESCRIPTIONS = [
  "主营海外渠道开发，正在评估新的长期供应商。",
  "重点覆盖欧洲和东南亚市场，关注交期与认证要求。",
  "已完成初步询盘，下一步需要确认样品和报价。",
  "通过行业展会建立联系，采购计划正在内部审批。",
];

export const generateCompanies = (db: Db, size = 55): Required<Company>[] => {
  return Array.from(Array(size).keys()).map((id) => {
    const baseName = COMPANY_NAMES[id % COMPANY_NAMES.length];
    const name = `${baseName}${Math.floor(id / COMPANY_NAMES.length) + 1}号客户`;
    return {
      id,
      name: name,
      company: name,
      logo: {
        title: name,
        src: `https://marmelab.com/react-admin-crm/logos/${id}.png`,
      } as RAFile,
      sector: random.arrayElement(defaultCompanySectors).value,
      size: random.arrayElement(sizes) as 1 | 10 | 50 | 250 | 500,
      linkedin_url: `https://www.linkedin.com/company/${name
        .toLowerCase()
        .replace(regex, "_")}`,
      website: internet.url(),
      phone_number: phone.phoneNumber(),
      address: address.streetAddress(),
      zipcode: address.zipCode(),
      city: address.city(),
      state_abbr: address.stateAbbr(),
      nb_contacts: 0,
      nb_deals: 0,
      // at least 1/3rd of companies for Jane Doe
      sales_id: datatype.number(2) === 0 ? 0 : random.arrayElement(db.sales).id,
      created_at: randomDate().toISOString(),
      updated_at: randomDate().toISOString(),
      source: random.arrayElement(["转介绍", "官网", "行业展会"]),
      grade: random.arrayElement(["A", "B", "C"]),
      status: random.arrayElement(["active", "inactive"]),
      deleted_at: null,
      description: random.arrayElement(COMPANY_DESCRIPTIONS),
      revenue: random.arrayElement([
        "100 万元",
        "1000 万元",
        "1 亿元",
        "10 亿元",
      ]),
      tax_identifier: random.alphaNumeric(10),
      country: random.arrayElement(["中国", "德国", "法国", "英国", "美国"]),
      context_links: [],
    };
  });
};
