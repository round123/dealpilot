import type { CustomerFollowUp, CustomerReminder } from "@dealpilot/api-client";
import { CoreAdminContext, type DataProvider } from "ra-core";
import fakeDataProvider from "ra-data-fakerest";
import { render } from "vitest-browser-react";

import { FollowUpCreate } from "../followUps/FollowUpCreate";
import { ReminderRow } from "../reminders/ReminderList";
import {
  groupReminder,
  isReminderOverdue,
} from "../reminders/reminderContract";

const i18nProvider = {
  translate: (key: string, options?: { _?: unknown }) =>
    typeof options?._ === "string" ? options._ : key,
  changeLocale: () => Promise.resolve(),
  getLocale: () => "zh-CN",
};

const renderProduct = (
  children: React.ReactNode,
  overrides: Partial<DataProvider> = {},
) => {
  const baseProvider = fakeDataProvider({
    companies: [
      {
        id: "13000000-0000-4000-8000-000000000001",
        name: "示例客户",
      },
    ],
    deals: [],
    follow_ups: [],
    reminders: [],
  });
  return render(
    <CoreAdminContext
      dataProvider={{ ...baseProvider, ...overrides }}
      i18nProvider={i18nProvider}
    >
      {children}
    </CoreAdminContext>,
  );
};

const buildReminder = (
  overrides: Partial<CustomerReminder> = {},
): CustomerReminder =>
  ({
    id: "11000000-0000-4000-8000-000000000001",
    owner_user_id: "12000000-0000-4000-8000-000000000001",
    company_id: "13000000-0000-4000-8000-000000000001",
    deal_id: null,
    type: "waiting_reply",
    status: "snoozed",
    due_at: "2026-08-01T09:00:00.000Z",
    priority: "normal",
    last_notified_at: null,
    snooze_until: "2026-08-01T09:00:00.000Z",
    resolution: null,
    deletion_event_id: null,
    created_at: "2026-07-01T09:00:00.000Z",
    updated_at: "2026-07-01T09:00:00.000Z",
    ...overrides,
  }) as CustomerReminder;

describe("Follow-up and Reminder products", () => {
  it("keeps Follow-up form values while a failed save returns to editable state", async () => {
    let rejectCreate: (reason?: unknown) => void = () => undefined;
    const create = vi.fn(
      () =>
        new Promise((_, reject) => {
          rejectCreate = reject;
        }),
    );
    const companyId =
      "13000000-0000-4000-8000-000000000001" as CustomerFollowUp["company_id"];
    const screen = await renderProduct(
      <FollowUpCreate defaultValues={{ company_id: companyId }} />,
      { create: create as never },
    );
    const note = screen.getByLabelText("跟进记录");
    await note.fill("客户确认下周继续沟通");

    const save = screen.getByRole("button", { name: "保存跟进" });
    await save.click();
    await expect.element(save).toBeDisabled();
    expect(create).toHaveBeenCalledOnce();

    rejectCreate(new Error("offline"));
    await expect.element(screen.getByRole("alert")).toBeVisible();
    await expect.element(note).toHaveValue("客户确认下周继续沟通");
    await expect.element(save).toBeEnabled();
  });

  it("classifies overdue, today, upcoming, and closed reminders", () => {
    const now = new Date("2026-07-30T08:00:00.000Z");

    expect(
      isReminderOverdue(
        buildReminder({
          status: "pending",
          due_at: "2026-07-29T08:00:00.000Z",
          snooze_until: null,
        }),
        now,
      ),
    ).toBe(true);
    expect(
      groupReminder(
        buildReminder({
          status: "pending",
          due_at: "2026-07-30T10:00:00.000Z",
          snooze_until: null,
        }),
        now,
      ),
    ).toBe("today");
    expect(groupReminder(buildReminder(), now)).toBe("upcoming");
    expect(groupReminder(buildReminder({ status: "completed" }), now)).toBe(
      "closed",
    );
  });

  it("changes waiting-reply reminders only after the manual reply action", async () => {
    const reminder = buildReminder();
    const update = vi.fn(async (_resource, params) => ({
      data: { ...reminder, ...params.data },
    }));
    const screen = await renderProduct(
      <ReminderRow
        reminder={reminder}
        now={new Date("2026-07-30T08:00:00.000Z")}
      />,
      { update: update as never },
    );

    expect(update).not.toHaveBeenCalled();
    await screen.getByRole("button", { name: "已收到回复" }).click();

    await expect.poll(() => update.mock.calls.length).toBe(1);
    expect(update.mock.calls[0]?.[1].data).toEqual({
      status: "replied",
      resolution: "reply_received",
      snooze_until: null,
    });
  });

  it("submits a custom snooze timestamp without automatic retry", async () => {
    const reminder = buildReminder({ type: "fixed_time", status: "pending" });
    const update = vi.fn(async (_resource, params) => ({
      data: { ...reminder, ...params.data },
    }));
    const screen = await renderProduct(
      <ReminderRow
        reminder={reminder}
        now={new Date("2026-07-30T08:00:00.000Z")}
      />,
      { update: update as never },
    );

    await screen.getByRole("button", { name: "自定义稍后" }).click();
    const snoozeInput = screen.getByLabelText("稍后提醒时间");
    await snoozeInput.fill("2026-08-02T10:30");
    await screen.getByRole("button", { name: "确认稍后提醒" }).click();

    await expect.poll(() => update.mock.calls.length).toBe(1);
    expect(update.mock.calls[0]?.[1].data).toMatchObject({
      status: "snoozed",
      snooze_until: new Date("2026-08-02T10:30").toISOString(),
    });
  });
});
