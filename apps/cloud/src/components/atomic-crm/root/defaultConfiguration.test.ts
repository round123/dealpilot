import { describe, expect, it } from "vitest";

import type { ConfigurationContextValue } from "./ConfigurationContext";
import {
  defaultConfiguration,
  defaultDealStages,
  normalizeDealStageConfiguration,
} from "./defaultConfiguration";

describe("deal-stage configuration", () => {
  it("uses every PostgreSQL stage as a Cloud choice", () => {
    expect(defaultDealStages.map(({ value }) => value)).toEqual([
      "lead",
      "qualified",
      "proposal",
      "negotiation",
      "closed_won",
      "closed_lost",
      "archived",
    ]);
  });

  it("migrates persisted Atomic stages without losing custom labels", () => {
    const legacy = {
      ...defaultConfiguration,
      dealStages: [
        { value: "opportunity", label: "Opportunity" },
        { value: "proposal-sent", label: "Priority review" },
        { value: "in-negociation", label: "In Negotiation" },
        { value: "delayed", label: "Delayed" },
        { value: "won", label: "Won" },
        { value: "lost", label: "Lost" },
      ],
      dealPipelineStatuses: ["won"],
    } as unknown as ConfigurationContextValue;

    const normalized = normalizeDealStageConfiguration(legacy);

    expect(normalized.dealStages).toEqual([
      { value: "lead", label: "Lead" },
      { value: "qualified", label: "Priority review" },
      { value: "proposal", label: "Proposal" },
      { value: "negotiation", label: "Negotiation" },
      { value: "closed_won", label: "Closed won" },
      { value: "closed_lost", label: "Closed lost" },
      { value: "archived", label: "Archived" },
    ]);
    expect(normalized.dealPipelineStatuses).toEqual(["closed_won"]);
  });
});
