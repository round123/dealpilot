import { describe, expect, it } from "vitest";

import { DEAL_STAGE_VALUES, DealStageSchema } from "../src/index.js";

describe("DealStageSchema", () => {
  it("matches the PostgreSQL deal_stage enum in canonical order", () => {
    expect(DealStageSchema.options).toEqual(DEAL_STAGE_VALUES);
    expect(DEAL_STAGE_VALUES).toEqual([
      "lead",
      "qualified",
      "proposal",
      "negotiation",
      "closed_won",
      "closed_lost",
      "archived",
    ]);
  });

  it.each(["opportunity", "proposal-sent", "in-negociation", "won", "lost"])(
    "rejects the legacy Atomic stage %s at the API boundary",
    (stage) => {
      expect(DealStageSchema.safeParse(stage).success).toBe(false);
    },
  );
});
