import type { TranslateFunction } from "ra-core";

import type { LabeledValue } from "../types";

export type ConfigurationLabelGroup =
  | "companySectors"
  | "dealCategories"
  | "dealStages"
  | "noteStatuses"
  | "taskTypes";

const atomicDefaultLabels: Record<
  ConfigurationLabelGroup,
  Record<string, string>
> = {
  companySectors: {
    "communication-services": "Communication Services",
    "consumer-discretionary": "Consumer Discretionary",
    "consumer-staples": "Consumer Staples",
    energy: "Energy",
    financials: "Financials",
    "health-care": "Health Care",
    industrials: "Industrials",
    "information-technology": "Information Technology",
    materials: "Materials",
    "real-estate": "Real Estate",
    utilities: "Utilities",
  },
  dealCategories: {
    other: "Other",
    copywriting: "Copywriting",
    "print-project": "Print project",
    "ui-design": "UI Design",
    "website-design": "Website design",
  },
  dealStages: {
    opportunity: "Opportunity",
    "proposal-sent": "Proposal Sent",
    "in-negociation": "In Negotiation",
    won: "Won",
    lost: "Lost",
    delayed: "Delayed",
  },
  noteStatuses: {
    cold: "Cold",
    warm: "Warm",
    hot: "Hot",
    "in-contract": "In Contract",
  },
  taskTypes: {
    none: "None",
    email: "Email",
    demo: "Demo",
    lunch: "Lunch",
    meeting: "Meeting",
    "follow-up": "Follow-up",
    "thank-you": "Thank you",
    ship: "Ship",
    call: "Call",
  },
};

const getDefaultLabel = (group: ConfigurationLabelGroup, value: string) =>
  atomicDefaultLabels[group][value];

const getTranslationKey = (group: ConfigurationLabelGroup, value: string) =>
  `crm.configuration_defaults.${group}.${value}`;

/**
 * Localize only an untouched Atomic default. Matching both the stable value and
 * the original English label prevents a user's custom label from being replaced.
 */
export const getLocalizedConfigurationLabel = (
  group: ConfigurationLabelGroup,
  item: LabeledValue,
  translate: TranslateFunction,
) => {
  const defaultLabel = getDefaultLabel(group, item.value);
  if (!defaultLabel || item.label !== defaultLabel) return item.label;

  return translate(getTranslationKey(group, item.value), {
    _: item.label,
  });
};

export const localizeConfigurationChoices = <T extends LabeledValue>(
  group: ConfigurationLabelGroup,
  items: T[],
  translate: TranslateFunction,
): T[] =>
  items.map((item) => ({
    ...item,
    label: getLocalizedConfigurationLabel(group, item, translate),
  }));

/**
 * Keep the canonical English label in form state when a localized default is
 * displayed unchanged. Any edited or custom label is returned verbatim.
 */
export const parseLocalizedConfigurationLabel = (
  group: ConfigurationLabelGroup,
  item: LabeledValue,
  displayedLabel: string,
  translate: TranslateFunction,
) => {
  const defaultLabel = getDefaultLabel(group, item.value);
  if (!defaultLabel || item.label !== defaultLabel) return displayedLabel;

  const localizedLabel = translate(getTranslationKey(group, item.value), {
    _: defaultLabel,
  });
  return displayedLabel === localizedLabel ? defaultLabel : displayedLabel;
};
