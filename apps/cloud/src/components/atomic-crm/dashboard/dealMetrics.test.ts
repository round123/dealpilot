import { describe, expect, it } from "vitest";

import { summarizeDealAmounts } from "./dealMetrics";

describe("summarizeDealAmounts", () => {
  it("uses the PostgreSQL deal-stage contract for weighted pipeline totals", () => {
    expect(
      summarizeDealAmounts([
        { stage: "lead", amount: 100 },
        { stage: "qualified", amount: 100 },
        { stage: "proposal", amount: 100 },
        { stage: "negotiation", amount: 100 },
        { stage: "closed_won", amount: 100 },
        { stage: "closed_lost", amount: 100 },
        { stage: "archived", amount: 100 },
      ]),
    ).toEqual({ won: 100, pending: 180, lost: -100 });
  });
});
