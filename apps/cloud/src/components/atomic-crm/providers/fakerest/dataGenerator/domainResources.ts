import { datatype, random } from "faker/locale/zh_CN";

import type {
  DealMilestone,
  DealRisk,
  FollowUp,
  Reminder,
  SocialAccount,
} from "../../../types";
import {
  getMilestoneReminderDueAt,
  milestoneReminderKey,
} from "../domainRules";
import type { Db } from "./types";

const now = () => new Date();
const addDays = (date: Date, days: number) =>
  new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
const isoDate = (date: Date) => date.toISOString().slice(0, 10);

export const generateSocialAccounts = (db: Db): SocialAccount[] =>
  db.contacts.slice(0, 30).map((contact, id) => {
    const platform = random.arrayElement(["whatsapp", "telegram"]);
    const identifier = `${platform}_${contact.id}`;
    return {
      id,
      owner_user_id: contact.sales_id,
      company_id: contact.company_id!,
      contact_id: contact.id,
      platform,
      raw_identifier: identifier,
      normalized_identifier: identifier.toLocaleLowerCase(),
      manually_bound: datatype.boolean(),
      created_at: contact.first_seen,
      updated_at: contact.last_seen,
    };
  });

export const generateFollowUps = (db: Db): FollowUp[] =>
  db.contacts.slice(0, 60).map((contact, id) => {
    const deal = db.deals.find(
      (candidate) => candidate.company_id === contact.company_id,
    );
    const occurredAt = contact.last_seen;
    return {
      id,
      owner_user_id: contact.sales_id,
      company_id: contact.company_id!,
      deal_id: deal?.id ?? null,
      type: random.arrayElement(["call", "email", "chat", "visit", "note"]),
      note: random.arrayElement([
        "已确认客户当前采购计划和关键时间点。",
        "客户要求补充产品参数、认证资料和交期说明。",
        "完成电话沟通，下一步发送正式报价。",
        "样品反馈良好，等待客户内部评审结果。",
      ]),
      message_body: null,
      message_direction: null,
      occurred_at: occurredAt,
      created_at: occurredAt,
      updated_at: occurredAt,
    };
  });

export const generateDealRisks = (db: Db): DealRisk[] =>
  db.deals.slice(0, 24).map((deal, id) => ({
    id,
    owner_user_id: deal.sales_id,
    deal_id: deal.id,
    description: random.arrayElement([
      "客户预算尚未最终批准",
      "关键原材料交期存在波动",
      "竞争对手正在同步报价",
      "认证资料仍需客户确认",
    ]),
    severity: random.arrayElement(["low", "medium", "high", "critical"]),
    status: random.arrayElement(["open", "handling", "resolved"]),
    handled_at: null,
    created_at: addDays(
      now(),
      -datatype.number({ min: 0, max: 14 }),
    ).toISOString(),
    updated_at: now().toISOString(),
  }));

export const generateDealMilestones = (db: Db): DealMilestone[] =>
  db.deals.slice(0, 24).map((deal, id) => ({
    id,
    owner_user_id: deal.sales_id,
    deal_id: deal.id,
    name: random.arrayElement(["寄送样品", "确认报价", "签订合同"]),
    due_date: isoDate(addDays(now(), datatype.number({ min: 2, max: 30 }))),
    completed: false,
    created_at: now().toISOString(),
    updated_at: now().toISOString(),
  }));

export const generateReminders = (db: Db): Reminder[] =>
  db.deal_milestones.map((milestone, id) => {
    const deal = db.deals.find(
      (candidate) => candidate.id === milestone.deal_id,
    )!;
    const createdAt = milestone.created_at;
    return {
      id,
      owner_user_id: deal.sales_id,
      company_id: deal.company_id,
      deal_id: deal.id,
      type: "fixed_time",
      status: "pending",
      due_at: getMilestoneReminderDueAt(milestone.due_date),
      priority: "normal",
      last_notified_at: null,
      snooze_until: null,
      resolution: milestoneReminderKey(milestone),
      deletion_event_id: null,
      created_at: createdAt,
      updated_at: createdAt,
    };
  });
