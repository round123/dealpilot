import {
  isClosedDealStage,
  validateClosedReason,
  validateCurrency,
  validateProbability,
} from "./dealValidation";

describe("deal validation", () => {
  it.each([0, 1, 50, 99, 100])(
    "accepts probability boundary value %s",
    (value) => {
      expect(validateProbability(value, {}, {})).toBeUndefined();
    },
  );

  it.each([-1, 101, 12.5, "not-a-number"])(
    "rejects invalid probability %s",
    (value) => {
      expect(validateProbability(value, {}, {})).toBeTruthy();
    },
  );

  it("requires a reason only when the deal is lost or closed", () => {
    expect(validateClosedReason("", { stage: "closed_lost" }, {})).toBeTruthy();
    expect(validateClosedReason("", { stage: "archived" }, {})).toBeTruthy();
    expect(
      validateClosedReason("Customer postponed", { stage: "closed_lost" }, {}),
    ).toBeUndefined();
    expect(validateClosedReason("", { stage: "proposal" }, {})).toBeUndefined();
    expect(isClosedDealStage("closed_lost")).toBe(true);
    expect(isClosedDealStage("closed_won")).toBe(false);
  });

  it("accepts only three-letter uppercase currency codes", () => {
    expect(validateCurrency("CNY", {}, {})).toBeUndefined();
    expect(validateCurrency("USD", {}, {})).toBeUndefined();
    expect(validateCurrency("cny", {}, {})).toBeTruthy();
    expect(validateCurrency("USDT", {}, {})).toBeTruthy();
  });
});
