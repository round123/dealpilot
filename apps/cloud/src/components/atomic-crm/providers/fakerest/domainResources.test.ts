import { afterEach, describe, expect, it, vi } from "vitest";

import type {
  DealMilestone,
  DealRisk,
  FollowUp,
  Reminder,
  SocialAccount,
} from "../../types";
import { createDataProvider } from "./dataProvider";
import generateData from "./dataGenerator";
import { milestoneReminderKey } from "./domainRules";

afterEach(() => {
  vi.useRealTimers();
});

describe("Fakerest DealPilot resources", () => {
  it("generates all local domain resources with valid references", () => {
    const db = generateData();
    const companyIds = new Set(db.companies.map(({ id }) => id));
    const contactIds = new Set(db.contacts.map(({ id }) => id));
    const dealIds = new Set(db.deals.map(({ id }) => id));

    expect(db.social_accounts.length).toBeGreaterThan(0);
    expect(db.follow_ups.length).toBeGreaterThan(0);
    expect(db.reminders.length).toBeGreaterThan(0);
    expect(db.deal_risks.length).toBeGreaterThan(0);
    expect(db.deal_milestones.length).toBeGreaterThan(0);

    for (const account of db.social_accounts) {
      expect(companyIds.has(account.company_id)).toBe(true);
      expect(account.contact_id == null || contactIds.has(account.contact_id)).toBe(
        true,
      );
    }
    for (const followUp of db.follow_ups) {
      expect(companyIds.has(followUp.company_id)).toBe(true);
      expect(followUp.deal_id == null || dealIds.has(followUp.deal_id)).toBe(true);
    }
    for (const reminder of db.reminders) {
      expect(companyIds.has(reminder.company_id)).toBe(true);
      expect(reminder.deal_id == null || dealIds.has(reminder.deal_id)).toBe(true);
    }
    for (const risk of db.deal_risks) {
      expect(dealIds.has(risk.deal_id)).toBe(true);
    }
    for (const milestone of db.deal_milestones) {
      expect(dealIds.has(milestone.deal_id)).toBe(true);
    }
  });

  it("applies create defaults, timestamps, and atomic reminder updates", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-30T08:00:00.000Z"));
    const db = generateData();
    const deal = db.deals[0]!;
    const provider = createDataProvider({ db, latency: 0, silent: true });

    const social = await provider.create<SocialAccount>("social_accounts", {
      data: {
        company_id: deal.company_id,
        platform: "telegram",
        raw_identifier: "ExampleUser",
        normalized_identifier: "exampleuser",
      } as SocialAccount,
    });
    const followUp = await provider.create<FollowUp>("follow_ups", {
      data: {
        company_id: deal.company_id,
        deal_id: deal.id,
        type: "note",
        note: "Local follow-up",
        occurred_at: "2026-07-30T07:00:00.000Z",
      } as FollowUp,
    });
    const reminder = await provider.create<Reminder>("reminders", {
      data: {
        company_id: deal.company_id,
        deal_id: deal.id,
        type: "fixed_time",
        due_at: "2026-08-01T09:00:00.000Z",
      } as Reminder,
    });
    const risk = await provider.create<DealRisk>("deal_risks", {
      data: {
        deal_id: deal.id,
        description: "Supplier delay",
        severity: "high",
      } as DealRisk,
    });

    expect(social.data).toMatchObject({
      manually_bound: false,
      created_at: "2026-07-30T08:00:00.000Z",
      updated_at: "2026-07-30T08:00:00.000Z",
    });
    expect(followUp.data.created_at).toBe("2026-07-30T08:00:00.000Z");
    expect(reminder.data).toMatchObject({ status: "pending", priority: "normal" });
    expect(risk.data.status).toBe("open");

    vi.setSystemTime(new Date("2026-07-30T09:00:00.000Z"));
    const updated = await provider.update<Reminder>("reminders", {
      id: reminder.data.id,
      data: { status: "completed" },
      previousData: reminder.data,
    });
    expect(updated.data.status).toBe("completed");
    expect(updated.data.updated_at).toBe("2026-07-30T09:00:00.000Z");
    expect(
      (await provider.getOne<Reminder>("reminders", { id: reminder.data.id }))
        .data.status,
    ).toBe("completed");
  });

  it("creates one reminder three days before a new milestone", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-30T08:00:00.000Z"));
    const db = generateData();
    const deal = db.deals[0]!;
    const provider = createDataProvider({ db, latency: 0, silent: true });

    const milestone = await provider.create<DealMilestone>("deal_milestones", {
      data: {
        deal_id: deal.id,
        name: "Confirm quotation",
        due_date: "2026-08-10",
      } as DealMilestone,
    });

    expect(milestone.data.completed).toBe(false);
    const reminders = await provider.getList<Reminder>("reminders", {
      filter: { resolution: milestoneReminderKey(milestone.data) },
      pagination: { page: 1, perPage: 10 },
      sort: { field: "id", order: "ASC" },
    });
    expect(reminders.data).toHaveLength(1);
    expect(reminders.data[0]).toMatchObject({
      company_id: deal.company_id,
      deal_id: deal.id,
      due_at: "2026-08-07T09:00:00.000Z",
      status: "pending",
      priority: "normal",
    });
  });
});
