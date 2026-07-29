import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

type BadgeVariant =
  | "default"
  | "grade-a"
  | "grade-b"
  | "grade-c"
  | "grade-s"
  | "success"
  | "warning"
  | "error"
  | "info"
  | "stage";

const GRADE_STYLES: Record<string, string> = {
  A: "bg-grade-a text-white",
  B: "bg-grade-b text-white",
  C: "bg-grade-c text-white",
  S: "bg-grade-s text-white",
};

export interface BadgeProps {
  children: ReactNode;
  variant?: BadgeVariant;
  grade?: "A" | "B" | "C" | "S";
  stageColor?: string;
  className?: string;
}

const VARIANT_STYLES: Record<BadgeVariant, string> = {
  default: "bg-bg-hover text-text-secondary border-border-default",
  "grade-a": "bg-grade-a text-white border-transparent",
  "grade-b": "bg-grade-b text-white border-transparent",
  "grade-c": "bg-grade-c text-white border-transparent",
  "grade-s": "bg-grade-s text-white border-transparent",
  success: "bg-success-light text-success-dark border-transparent",
  warning: "bg-warning-light text-warning-dark border-transparent",
  error: "bg-error-light text-error-dark border-transparent",
  info: "bg-info-light text-info-dark border-transparent",
  stage: "border-transparent",
};

export function Badge({ children, variant = "default", grade, stageColor, className }: BadgeProps) {
  let resolvedClass: string;

  if (grade) {
    resolvedClass = GRADE_STYLES[grade] ?? GRADE_STYLES.B;
  } else if (variant === "stage" && stageColor) {
    resolvedClass = `border-transparent`;
  } else {
    resolvedClass = VARIANT_STYLES[variant];
  }

  const style: React.CSSProperties =
    variant === "stage" && stageColor
      ? { backgroundColor: `color-mix(in srgb, ${stageColor} 12%, transparent)`, color: stageColor }
      : {};

  return (
    <span
      className={cn(
        "inline-flex items-center justify-center rounded-full px-2 py-0.5 text-xs font-medium border whitespace-nowrap",
        resolvedClass,
        className,
      )}
      style={style}
    >
      {children}
    </span>
  );
}

export function GradeBadge({ grade, size = "md" }: { grade: string; size?: "sm" | "md" }) {
  const sizeClass = size === "sm" ? "h-5 w-5 text-[10px]" : "h-6 w-6 text-xs";
  const gradeColor = grade === "A" ? "var(--color-grade-a)" : grade === "B" ? "var(--color-grade-b)" : grade === "S" ? "var(--color-grade-s)" : "var(--color-grade-c)";
  return (
    <span
      className={cn("inline-flex items-center justify-center rounded-full font-semibold text-white", sizeClass)}
      style={{ backgroundColor: gradeColor }}
    >
      {grade}
    </span>
  );
}

export function StageBadge({ stage }: { stage: string }) {
  const color =
    stage === "lead" ? "var(--color-stage-need)" :
    stage === "qualified" ? "var(--color-stage-sample)" :
    stage === "proposal" ? "var(--color-stage-quote)" :
    stage === "negotiation" ? "var(--color-stage-negotiate)" :
    stage === "closed_won" ? "var(--color-stage-won)" :
    stage === "closed_lost" ? "var(--color-stage-lost)" :
    "var(--color-gray-400)";
  const labels: Record<string, string> = {
    lead: "需求确认",
    qualified: "方案/样品",
    proposal: "报价",
    negotiation: "谈判",
    closed_won: "成交",
    closed_lost: "失单",
    archived: "已归档",
  };
  return <Badge variant="stage" stageColor={color}>{labels[stage] ?? stage}</Badge>;
}
