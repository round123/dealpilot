import type { DealStage } from "@dealpilot/api-client";

type DealAmount = { stage: DealStage; amount: number };

const ACTIVE_STAGE_MULTIPLIER: Record<
  Exclude<DealStage, "closed_won" | "closed_lost" | "archived">,
  number
> = {
  lead: 0.2,
  qualified: 0.3,
  proposal: 0.5,
  negotiation: 0.8,
};

export const summarizeDealAmounts = (deals: DealAmount[]) =>
  deals.reduce(
    (totals, deal) => {
      if (deal.stage === "closed_won") totals.won += deal.amount;
      else if (deal.stage === "closed_lost") totals.lost -= deal.amount;
      else if (deal.stage !== "archived") {
        totals.pending += deal.amount * ACTIVE_STAGE_MULTIPLIER[deal.stage];
      }
      return totals;
    },
    { won: 0, pending: 0, lost: 0 },
  );
