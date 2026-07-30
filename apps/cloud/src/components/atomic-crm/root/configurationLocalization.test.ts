import { describe, expect, it, vi } from "vitest";

import {
  getLocalizedConfigurationLabel,
  localizeConfigurationChoices,
  parseLocalizedConfigurationLabel,
} from "./configurationLocalization";

const translations: Record<string, string> = {
  "crm.configuration_defaults.noteStatuses.hot": "高意向",
  "crm.configuration_defaults.dealStages.won": "已成交",
};
const translate = vi.fn(
  (key: string, options?: { _: string }) =>
    translations[key] ?? options?._ ?? key,
);

describe("configuration label localization", () => {
  it("localizes an untouched Atomic default by value and English label", () => {
    expect(
      getLocalizedConfigurationLabel(
        "noteStatuses",
        { value: "hot", label: "Hot" },
        translate,
      ),
    ).toBe("高意向");
  });

  it("preserves a custom label even when it uses a default value", () => {
    expect(
      getLocalizedConfigurationLabel(
        "noteStatuses",
        { value: "hot", label: "重点客户" },
        translate,
      ),
    ).toBe("重点客户");
  });

  it("keeps the canonical label when the active language is English", () => {
    const englishTranslate = (_key: string, options?: { _: string }) =>
      options?._ ?? _key;

    expect(
      getLocalizedConfigurationLabel(
        "noteStatuses",
        { value: "hot", label: "Hot" },
        englishTranslate,
      ),
    ).toBe("Hot");
  });

  it("preserves a default-looking label assigned to a custom value", () => {
    expect(
      getLocalizedConfigurationLabel(
        "noteStatuses",
        { value: "priority", label: "Hot" },
        translate,
      ),
    ).toBe("Hot");
  });

  it("keeps values and extra fields unchanged when localizing choices", () => {
    expect(
      localizeConfigurationChoices(
        "noteStatuses",
        [{ value: "hot", label: "Hot", color: "#e88b7d" }],
        translate,
      ),
    ).toEqual([{ value: "hot", label: "高意向", color: "#e88b7d" }]);
  });

  it("parses an unchanged localized default back to its canonical label", () => {
    expect(
      parseLocalizedConfigurationLabel(
        "dealStages",
        { value: "won", label: "Won" },
        "已成交",
        translate,
      ),
    ).toBe("Won");
  });

  it("returns an edited label verbatim", () => {
    expect(
      parseLocalizedConfigurationLabel(
        "dealStages",
        { value: "won", label: "Won" },
        "已签约",
        translate,
      ),
    ).toBe("已签约");
  });
});
