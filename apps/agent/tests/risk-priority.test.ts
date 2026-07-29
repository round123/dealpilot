import { describe, expect, test } from "bun:test";
import { sortRisksByPriority } from "../src/services/risk-priority";

const now = new Date("2026-07-29T12:00:00.000Z");

describe("risk priority ordering", () => {
  test("raises a seven-day open risk by one severity tier without mutating it", () => {
    const risks = [
      { id: "new-high", severity: "high", status: "open", created_at: "2026-07-28T12:00:00.000Z" },
      { id: "old-medium", severity: "medium", status: "open", created_at: "2026-07-22T12:00:00.000Z" },
      { id: "resolved-critical", severity: "critical", status: "resolved", created_at: "2026-07-01T12:00:00.000Z" },
    ];

    const sorted = sortRisksByPriority(risks, now);

    expect(sorted.map((risk) => risk.id)).toEqual(["old-medium", "new-high", "resolved-critical"]);
    expect(sorted[0]).toEqual(risks[1]);
    expect(risks[1].status).toBe("open");
    expect(risks[1].severity).toBe("medium");
  });

  test("does not escalate a handled risk", () => {
    const sorted = sortRisksByPriority([
      { id: "old-handling", severity: "medium", status: "handling", created_at: "2026-07-01T12:00:00.000Z" },
      { id: "new-high", severity: "high", status: "open", created_at: "2026-07-28T12:00:00.000Z" },
    ], now);

    expect(sorted.map((risk) => risk.id)).toEqual(["new-high", "old-handling"]);
  });
});
