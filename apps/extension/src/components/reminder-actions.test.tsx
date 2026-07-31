import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { ReminderActions } from "./reminder-actions";

describe("ReminderActions", () => {
  test("shows the reply action only for waiting-reply reminders", () => {
    const waiting = renderToStaticMarkup(
      <ReminderActions
        reminderType="waiting_reply"
        busy={false}
        colorPrefix="--color"
        onAction={() => undefined}
      />,
    );
    const fixed = renderToStaticMarkup(
      <ReminderActions
        reminderType="fixed_time"
        busy={false}
        colorPrefix="--color"
        onAction={() => undefined}
      />,
    );
    expect(waiting).toContain("已收到回复");
    expect(fixed).not.toContain("已收到回复");
  });

  test("disables every command while a mutation is pending", () => {
    const markup = renderToStaticMarkup(
      <ReminderActions
        reminderType="fixed_time"
        busy
        colorPrefix="--dp-color"
        error="处理失败"
        onAction={() => undefined}
      />,
    );
    expect(markup.match(/disabled=""/g)).toHaveLength(3);
    expect(markup).toContain("可再次点击操作重试");
  });
});
