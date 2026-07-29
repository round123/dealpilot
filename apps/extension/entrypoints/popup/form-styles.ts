/**
 * DealPilot Popup 新建客户表单样式常量
 */

import type { CSSProperties } from "react";

export const INPUT_STYLE: CSSProperties = {
  width: "100%",
  height: "36px",
  padding: "0 10px",
  border: "1px solid var(--color-border-default)",
  borderRadius: "var(--radius-md)",
  fontSize: "13px",
  fontFamily: "var(--font-sans)",
  outline: "none",
};

export const LABEL_STYLE: CSSProperties = {
  display: "block",
  fontSize: "12px",
  fontWeight: 500,
  color: "var(--color-text-secondary)",
  marginBottom: "4px",
};

export const ERROR_STYLE: CSSProperties = {
  fontSize: "11px",
  color: "var(--color-error)",
  marginTop: "4px",
};

export const SECONDARY_BUTTON: CSSProperties = {
  flex: 1,
  height: "36px",
  border: "1px solid var(--color-border-default)",
  borderRadius: "var(--radius-md)",
  backgroundColor: "var(--color-bg-card)",
  color: "var(--color-text-primary)",
  fontSize: "13px",
  fontWeight: 500,
  cursor: "pointer",
};

export const PRIMARY_BUTTON: CSSProperties = {
  flex: 1,
  height: "36px",
  border: "1px solid var(--color-primary)",
  borderRadius: "var(--radius-md)",
  backgroundColor: "var(--color-primary)",
  color: "var(--color-text-inverse)",
  fontSize: "13px",
  fontWeight: 500,
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: "4px",
};
