import { describe, expect, test } from "bun:test";
import type { ReactElement } from "react";
import { MultipleMatchState } from "../../entrypoints/content/components/match-states";

const candidates = [
  { id: "customer-1", name: "Customer One", company: "Acme" },
  { id: "customer-2", name: "Customer Two", company: null },
];

function buttons(node: unknown): Array<ReactElement<{ disabled?: boolean; onClick?: () => void }>> {
  if (!node) return [];
  if (Array.isArray(node)) return node.flatMap(buttons);
  if (typeof node !== "object" || !("type" in node)) return [];
  const element = node as ReactElement<{ children?: unknown; disabled?: boolean; onClick?: () => void }>;
  if (element.type === "button") return [element];
  return buttons(element.props.children);
}

describe("MultipleMatchState", () => {
  test("does not confirm a candidate during render; clicking confirms only that candidate", () => {
    const selected: string[] = [];
    const element = MultipleMatchState({
      candidates,
      bindLoading: false,
      onSelect: (customerId) => selected.push(customerId),
    });

    const candidateButtons = buttons(element);
    expect(candidateButtons).toHaveLength(2);
    expect(selected).toEqual([]);

    candidateButtons[1]?.props.onClick?.();
    expect(selected).toEqual(["customer-2"]);
  });

  test("disables every confirmation while binding is pending", () => {
    const element = MultipleMatchState({
      candidates,
      bindLoading: true,
      onSelect: () => undefined,
    });

    expect(buttons(element).every((button) => button.props.disabled)).toBe(true);
  });
});
