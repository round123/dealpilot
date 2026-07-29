/**
 * DealPilot 插件客户档案摘要组件
 *
 * 展示客户名称、公司、分级 Badge、国家等信息。
 * 在 Shadow DOM 内渲染，使用 --dp- 前缀 CSS 变量。
 */

import React from "react";
import { MapPin, Building2 } from "lucide-react";
import type { Customer } from "@dealpilot/shared";

/** 分级 Badge 颜色映射 */
const GRADE_COLORS: Record<string, string> = {
  A: "var(--dp-color-grade-a)",
  B: "var(--dp-color-grade-b)",
  C: "var(--dp-color-grade-c)",
};

interface CustomerCardProps {
  customer: Customer;
  /** 最近跟进时间（可选） */
  lastFollowUpAt?: string | null;
  /** 最近跟进备注 */
  lastFollowUpNote?: string | null;
}

/** 格式化相对时间 */
function formatRelative(iso: string | null | undefined): string {
  if (!iso) return "暂无跟进";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "暂无跟进";
  const diff = Date.now() - d.getTime();
  const days = Math.floor(diff / 86_400_000);
  const hours = Math.floor(diff / 3_600_000);
  if (days > 0) return `${days} 天前跟进`;
  if (hours > 0) return `${hours} 小时前跟进`;
  return "刚刚跟进";
}

export const CustomerCard: React.FC<CustomerCardProps> = ({
  customer,
  lastFollowUpAt,
  lastFollowUpNote,
}) => {
  const gradeColor = GRADE_COLORS[customer.grade] ?? GRADE_COLORS.C;

  return (
    <div
      style={{
        padding: "var(--dp-space-3)",
        borderBottom: "1px solid var(--dp-color-border-default)",
      }}
    >
      {/* 顶部：名称 + 分级 */}
      <div style={{ display: "flex", alignItems: "center", gap: "var(--dp-space-2)", marginBottom: "var(--dp-space-2)" }}>
        <span style={{ fontWeight: 600, fontSize: "14px", color: "var(--dp-color-text-primary)" }}>
          {customer.name}
        </span>
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: "20px",
            height: "20px",
            borderRadius: "var(--dp-radius-full)",
            backgroundColor: gradeColor,
            color: "var(--dp-color-text-inverse)",
            fontSize: "11px",
            fontWeight: 700,
            flexShrink: 0,
          }}
        >
          {customer.grade}
        </span>
      </div>

      {/* 公司 */}
      {customer.company && (
        <div style={{ display: "flex", alignItems: "center", gap: "var(--dp-space-1)", marginBottom: "var(--dp-space-1)" }}>
          <Building2 size={12} style={{ color: "var(--dp-color-text-tertiary)" }} />
          <span style={{ fontSize: "12px", color: "var(--dp-color-text-secondary)" }}>
            {customer.company}
          </span>
        </div>
      )}

      {/* 国家 + 来源 */}
      <div style={{ display: "flex", gap: "var(--dp-space-3)", marginBottom: "var(--dp-space-2)" }}>
        {customer.country && (
          <div style={{ display: "flex", alignItems: "center", gap: "var(--dp-space-1)" }}>
            <MapPin size={12} style={{ color: "var(--dp-color-text-tertiary)" }} />
            <span style={{ fontSize: "12px", color: "var(--dp-color-text-secondary)" }}>
              {customer.country}
            </span>
          </div>
        )}
        {customer.source && (
          <span style={{ fontSize: "12px", color: "var(--dp-color-text-tertiary)" }}>
            来源: {customer.source}
          </span>
        )}
      </div>

      {/* 最近跟进 */}
      <div
        style={{
          padding: "var(--dp-space-2)",
          backgroundColor: "var(--dp-color-gray-50)",
          borderRadius: "var(--dp-radius-md)",
          marginTop: "var(--dp-space-2)",
        }}
      >
        <div style={{ fontSize: "11px", color: "var(--dp-color-text-tertiary)", marginBottom: "var(--dp-space-1)" }}>
          {formatRelative(lastFollowUpAt)}
        </div>
        {lastFollowUpNote && (
          <div
            style={{
              fontSize: "12px",
              color: "var(--dp-color-text-secondary)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {lastFollowUpNote}
          </div>
        )}
      </div>
    </div>
  );
};
