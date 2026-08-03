import React from "react";
import { Check } from "lucide-react";

export const AutomaticMatchConfirmation: React.FC<{
  automaticMatch: boolean;
  bindingBusy: boolean;
  onConfirm: () => void;
}> = ({ automaticMatch, bindingBusy, onConfirm }) => {
  if (!automaticMatch) return null;
  return (
    <button
      type="button"
      onClick={onConfirm}
      disabled={bindingBusy}
      style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: "var(--dp-space-1)", marginBottom: "var(--dp-space-2)", padding: "var(--dp-space-1) var(--dp-space-2)", border: "1px solid var(--dp-color-primary)", borderRadius: "var(--dp-radius-md)", background: "var(--dp-color-primary)", color: "var(--dp-color-text-inverse)", cursor: "pointer", fontSize: "12px" }}
    >
      <Check size={13} />匹配正确
    </button>
  );
};
