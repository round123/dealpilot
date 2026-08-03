import { TestTranslationProvider } from "ra-core";
import { render } from "vitest-browser-react";

import { ContactMergeSummary } from "./ContactMergeButton";

const renderSummary = (
  props: React.ComponentProps<typeof ContactMergeSummary>,
) =>
  render(
    <TestTranslationProvider
      translate={(_key: string, options?: { _?: unknown }) =>
        typeof options?._ === "string" ? options._ : _key
      }
    >
      <ContactMergeSummary {...props} />
    </TestTranslationProvider>,
  );

describe("ContactMergeSummary", () => {
  it("shows every merge impact in Chinese", async () => {
    const screen = await renderSummary({
      notesCount: 2,
      tasksCount: 3,
      dealsCount: 4,
      emailCount: 2,
      phoneCount: 1,
    });

    for (const text of [
      "2 条备注将转移到保留联系人",
      "3 项任务将转移到保留联系人",
      "4 个项目将更新联系人",
      "2 个邮箱地址将添加到保留联系人",
      "1 个电话号码将添加到保留联系人",
    ]) {
      await expect
        .element(screen.getByText(text, { exact: true }))
        .toBeVisible();
    }
    expect(document.body.textContent).not.toMatch(
      /notes?|tasks?|deals?|email addresses?|phone numbers?|will be/i,
    );
  });

  it("uses a Chinese empty summary", async () => {
    const screen = await renderSummary({
      notesCount: 0,
      tasksCount: 0,
      dealsCount: 0,
      emailCount: 0,
      phoneCount: 0,
    });

    await expect
      .element(screen.getByText("没有需要合并的附加数据", { exact: true }))
      .toBeVisible();
  });
});
