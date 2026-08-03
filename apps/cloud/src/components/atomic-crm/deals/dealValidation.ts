import type { Validator } from "ra-core";

export const DEAL_GRADES = ["S", "A", "B", "C"] as const;

const CLOSED_DEAL_STAGES = new Set([
  "closed_lost",
  "archived",
]);

const probabilityMessage = {
  message: "resources.deals.validation.probability",
  args: { _: "成交概率必须是 0 到 100 之间的整数" },
};

const currencyMessage = {
  message: "resources.deals.validation.currency",
  args: { _: "币种必须是 3 位大写字母代码，例如 CNY 或 USD" },
};

const closedReasonMessage = {
  message: "resources.deals.validation.closed_reason",
  args: { _: "项目失单或关闭时必须填写原因" },
};

export const isClosedDealStage = (stage: unknown) =>
  typeof stage === "string" && CLOSED_DEAL_STAGES.has(stage);

export const validateProbability: Validator = (value) => {
  if (value === undefined || value === null || value === "") return;
  const numericValue = Number(value);
  if (
    !Number.isInteger(numericValue) ||
    numericValue < 0 ||
    numericValue > 100
  ) {
    return probabilityMessage;
  }
};

export const validateCurrency: Validator = (value) => {
  if (typeof value !== "string" || !/^[A-Z]{3}$/.test(value.trim())) {
    return currencyMessage;
  }
};

export const validateClosedReason: Validator = (value, values) => {
  if (
    isClosedDealStage(values?.stage) &&
    (typeof value !== "string" || value.trim() === "")
  ) {
    return closedReasonMessage;
  }
};
