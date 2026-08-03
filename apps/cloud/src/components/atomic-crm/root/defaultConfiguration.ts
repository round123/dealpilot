import type { ConfigurationContextValue } from "./ConfigurationContext";
import {
  DEAL_STAGE_VALUES,
  type DealStage as DealStageValue,
} from "@dealpilot/api-client";
import type { DealStage } from "../types";
// Import the logos as module assets so Vite resolves their URL relative to the
// JS chunk (import.meta.url), not the current route. A plain "./logos/..." path
// breaks on nested routes like /oauth/consent and under a deployment sub-path.
import darkModeLogo from "./logos/logo_atomic_crm_dark.svg";
import lightModeLogo from "./logos/logo_atomic_crm_light.svg";

export const defaultDarkModeLogo = darkModeLogo;
export const defaultLightModeLogo = lightModeLogo;

export const defaultCurrency = "USD";

export const defaultTitle = "DealPilot";

export const defaultCompanySectors = [
  { value: "communication-services", label: "Communication Services" },
  { value: "consumer-discretionary", label: "Consumer Discretionary" },
  { value: "consumer-staples", label: "Consumer Staples" },
  { value: "energy", label: "Energy" },
  { value: "financials", label: "Financials" },
  { value: "health-care", label: "Health Care" },
  { value: "industrials", label: "Industrials" },
  { value: "information-technology", label: "Information Technology" },
  { value: "materials", label: "Materials" },
  { value: "real-estate", label: "Real Estate" },
  { value: "utilities", label: "Utilities" },
];

export const defaultDealStages = [
  { value: "lead", label: "Lead" },
  { value: "qualified", label: "Qualified" },
  { value: "proposal", label: "Proposal" },
  { value: "negotiation", label: "Negotiation" },
  { value: "closed_won", label: "Closed won" },
  { value: "closed_lost", label: "Closed lost" },
  { value: "archived", label: "Archived" },
] satisfies DealStage[];

export const defaultDealPipelineStatuses: DealStageValue[] = ["closed_won"];

const legacyDealStages: Record<
  string,
  { value: DealStageValue; defaultLabels: readonly string[] }
> = {
  opportunity: { value: "lead", defaultLabels: ["Opportunity", "需求确认"] },
  "proposal-sent": {
    value: "qualified",
    defaultLabels: ["Proposal Sent", "方案/样品"],
  },
  "in-negociation": {
    value: "proposal",
    defaultLabels: ["In Negotiation", "报价"],
  },
  delayed: { value: "negotiation", defaultLabels: ["Delayed", "谈判"] },
  won: { value: "closed_won", defaultLabels: ["Won", "成交", "已成交"] },
  lost: { value: "closed_lost", defaultLabels: ["Lost", "失单", "已流失"] },
};

const dealStageValues = new Set<string>(DEAL_STAGE_VALUES);
const defaultStageByValue = new Map(
  defaultDealStages.map((stage) => [stage.value, stage]),
);

const toCanonicalStage = (stage: { value: string; label: string }) => {
  if (dealStageValues.has(stage.value)) {
    return { ...stage, value: stage.value as DealStageValue };
  }
  const legacy = legacyDealStages[stage.value];
  if (!legacy) return undefined;
  const label = legacy.defaultLabels.includes(stage.label)
    ? defaultStageByValue.get(legacy.value)!.label
    : stage.label;
  return { value: legacy.value, label };
};

export const normalizeDealStageConfiguration = (
  config: ConfigurationContextValue,
): ConfigurationContextValue => {
  const migrated = new Map<DealStageValue, DealStage>();
  for (const stage of config.dealStages ?? []) {
    const canonical = toCanonicalStage(stage);
    if (canonical && !migrated.has(canonical.value)) {
      migrated.set(canonical.value, canonical);
    }
  }

  const dealStages = defaultDealStages.map(
    (stage) => migrated.get(stage.value) ?? stage,
  );
  const dealPipelineStatuses = Array.from(
    new Set(
      (config.dealPipelineStatuses ?? [])
        .map((value) =>
          dealStageValues.has(value) ? value : legacyDealStages[value]?.value,
        )
        .filter((value): value is DealStageValue => value !== undefined),
    ),
  );

  return { ...config, dealStages, dealPipelineStatuses };
};

export const defaultDealCategories = [
  { value: "other", label: "Other" },
  { value: "copywriting", label: "Copywriting" },
  { value: "print-project", label: "Print project" },
  { value: "ui-design", label: "UI Design" },
  { value: "website-design", label: "Website design" },
];

export const defaultNoteStatuses = [
  { value: "cold", label: "Cold", color: "#7dbde8" },
  { value: "warm", label: "Warm", color: "#e8cb7d" },
  { value: "hot", label: "Hot", color: "#e88b7d" },
  { value: "in-contract", label: "In Contract", color: "#a4e87d" },
];

export const defaultTaskTypes = [
  { value: "none", label: "None" },
  { value: "email", label: "Email" },
  { value: "demo", label: "Demo" },
  { value: "lunch", label: "Lunch" },
  { value: "meeting", label: "Meeting" },
  { value: "follow-up", label: "Follow-up" },
  { value: "thank-you", label: "Thank you" },
  { value: "ship", label: "Ship" },
  { value: "call", label: "Call" },
];

export const defaultConfiguration: ConfigurationContextValue = {
  companySectors: defaultCompanySectors,
  currency: defaultCurrency,
  dealCategories: defaultDealCategories,
  dealPipelineStatuses: defaultDealPipelineStatuses,
  dealStages: defaultDealStages,
  noteStatuses: defaultNoteStatuses,
  taskTypes: defaultTaskTypes,
  title: defaultTitle,
  darkModeLogo: defaultDarkModeLogo,
  lightModeLogo: defaultLightModeLogo,
};
