import { useMemo } from "react";
import { useStore, useTranslate } from "ra-core";
import type { DealStage as DealStageValue } from "@dealpilot/api-client";

import type { DealStage, LabeledValue, NoteStatus } from "../types";
import {
  defaultConfiguration,
  normalizeDealStageConfiguration,
} from "./defaultConfiguration";
import { localizeConfigurationChoices } from "./configurationLocalization";

export const CONFIGURATION_STORE_KEY = "app.configuration";

export interface ConfigurationContextValue {
  companySectors: LabeledValue[];
  currency: string;
  dealCategories: LabeledValue[];
  dealPipelineStatuses: DealStageValue[];
  dealStages: DealStage[];
  noteStatuses: NoteStatus[];
  taskTypes: LabeledValue[];
  title: string;
  darkModeLogo: string;
  lightModeLogo: string;
}

export const useConfigurationContext = () => {
  const [config] = useStore<ConfigurationContextValue>(
    CONFIGURATION_STORE_KEY,
    defaultConfiguration,
  );
  // Merge with defaults so that missing fields in stored config
  // fall back to default values (e.g. when new settings are added)
  return useMemo(
    () =>
      normalizeDealStageConfiguration({ ...defaultConfiguration, ...config }),
    [config],
  );
};

/** Returns a display-only localized copy while preserving stored configuration. */
export const useLocalizedConfigurationContext = () => {
  const config = useConfigurationContext();
  const translate = useTranslate();

  return useMemo(
    () => ({
      ...config,
      companySectors: localizeConfigurationChoices(
        "companySectors",
        config.companySectors,
        translate,
      ),
      dealCategories: localizeConfigurationChoices(
        "dealCategories",
        config.dealCategories,
        translate,
      ),
      dealStages: localizeConfigurationChoices(
        "dealStages",
        config.dealStages,
        translate,
      ),
      noteStatuses: localizeConfigurationChoices(
        "noteStatuses",
        config.noteStatuses,
        translate,
      ),
      taskTypes: localizeConfigurationChoices(
        "taskTypes",
        config.taskTypes,
        translate,
      ),
    }),
    [config, translate],
  );
};

export const useConfigurationUpdater = () => {
  const [, setConfig] = useStore<ConfigurationContextValue>(
    CONFIGURATION_STORE_KEY,
  );
  return setConfig;
};
