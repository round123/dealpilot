import { RISK_ESCALATION_DAYS } from "@dealpilot/shared";

type RiskPriorityInput = {
  id: string;
  severity: string;
  status: string;
  created_at: string;
};

const severityWeight: Record<string, number> = {
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

export function sortRisksByPriority<T extends RiskPriorityInput>(
  risks: T[],
  now = new Date(),
): T[] {
  const escalationMs = RISK_ESCALATION_DAYS * 24 * 60 * 60 * 1000;
  const priority = (risk: T) => {
    const unresolvedWeight = risk.status === "open" || risk.status === "handling" ? 10 : 0;
    const escalatedWeight = risk.status === "open"
      && now.getTime() - new Date(risk.created_at).getTime() >= escalationMs
      ? 1
      : 0;
    return unresolvedWeight + (severityWeight[risk.severity] ?? 0) + escalatedWeight;
  };

  return [...risks].sort((a, b) =>
    priority(b) - priority(a)
    || new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    || a.id.localeCompare(b.id),
  );
}
