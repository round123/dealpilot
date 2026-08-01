import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { AutomaticMatchConfirmation } from "./match-confirmation";

test("shows confirmation only for automatic unique matches", () => {
  const automatic = renderToStaticMarkup(
    <AutomaticMatchConfirmation
      automaticMatch
      bindingBusy={false}
      onConfirm={() => undefined}
    />,
  );
  const manual = renderToStaticMarkup(
    <AutomaticMatchConfirmation
      automaticMatch={false}
      bindingBusy={false}
      onConfirm={() => undefined}
    />,
  );

  expect(automatic).toContain("匹配正确");
  expect(manual).not.toContain("匹配正确");
});

test("forwards confirmation clicks to the binding action", () => {
  let confirmed = 0;
  const element = AutomaticMatchConfirmation({
    automaticMatch: true,
    bindingBusy: false,
    onConfirm: () => { confirmed += 1; },
  });
  if (!element || !("props" in element)) throw new Error("Expected confirmation button");
  element.props.onClick();
  expect(confirmed).toBe(1);
});
