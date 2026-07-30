import type { CustomerDetail } from "@dealpilot/api-client";
import { TestTranslationProvider } from "ra-core";
import type { ReactNode } from "react";
import { render } from "vitest-browser-react";

import { CustomerRelatedSummary } from "./CustomerRelatedSummary";

const detail = {
  contacts: [
    {
      id: "063e9303-d2bb-4ba0-9514-d1e43e99662b",
      name: "Ada Lovelace",
      first_name: "Ada",
      last_name: "Lovelace",
      title: "CTO",
    },
  ],
  social_accounts: [
    {
      id: "f6bb2de1-f039-45d3-bdf7-2bf49707e35e",
      platform: "LinkedIn",
      raw_identifier: "ada-lovelace",
    },
  ],
  deals: [
    {
      id: "1b4c2709-c61b-4025-a4ec-a1824853cc5f",
      name: "Cloud rollout",
      stage: "proposal",
      amount: 12000,
      currency: "USD",
    },
  ],
  recent_follow_ups: [
    {
      id: "cc0d02e7-2af9-4273-a04e-8c429047cbfc",
      type: "call",
      note: "Discussed rollout timeline",
      message_body: null,
      occurred_at: "2026-07-29T09:00:00.000Z",
    },
  ],
  open_reminders: [
    {
      id: "ce8c7e43-091f-4fdb-900a-ed82849617e3",
      type: "waiting_reply",
      status: "pending",
      due_at: "2026-08-01T09:00:00.000Z",
    },
  ],
} as unknown as CustomerDetail;

const renderSummary = (children: ReactNode) =>
  render(
    <TestTranslationProvider translate={(key: string) => key}>
      {children}
    </TestTranslationProvider>,
  );

describe("CustomerRelatedSummary", () => {
  it("renders all five related customer summaries", async () => {
    const screen = await renderSummary(
      <CustomerRelatedSummary
        detail={detail}
        isPending={false}
        isError={false}
      />,
    );

    await expect.element(screen.getByText("Ada Lovelace")).toBeVisible();
    await expect.element(screen.getByText("ada-lovelace")).toBeVisible();
    await expect.element(screen.getByText("Cloud rollout")).toBeVisible();
    await expect
      .element(screen.getByText("Discussed rollout timeline"))
      .toBeVisible();
    await expect
      .element(
        screen.getByText("resources.companies.related.values.waiting_reply"),
      )
      .toBeVisible();
  });

  it("renders a distinct empty state for every related collection", async () => {
    const screen = await renderSummary(
      <CustomerRelatedSummary
        detail={{
          contacts: [],
          social_accounts: [],
          deals: [],
          recent_follow_ups: [],
          open_reminders: [],
        }}
        isPending={false}
        isError={false}
      />,
    );

    for (const label of [
      "resources.companies.related.empty_contacts",
      "resources.companies.related.empty_social_accounts",
      "resources.companies.related.empty_deals",
      "resources.companies.related.empty_recent_follow_ups",
      "resources.companies.related.empty_open_reminders",
    ]) {
      await expect.element(screen.getByText(label)).toBeVisible();
    }
  });

  it("uses a stable error message instead of exposing the server error", async () => {
    const screen = await renderSummary(
      <CustomerRelatedSummary detail={undefined} isPending={false} isError />,
    );

    await expect
      .element(screen.getByText("resources.companies.related.error_title"))
      .toBeVisible();
  });
});
