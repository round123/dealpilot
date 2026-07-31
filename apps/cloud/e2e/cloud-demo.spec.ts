import { expect, test, type Locator, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import path from "node:path";

type BrowserDiagnostic = {
  type: "error" | "warning" | "pageerror";
  text: string;
};

type CustomerDraft = {
  name: string;
  company?: string;
};

test.beforeEach(async ({ page }) => {
  const agentDataDir = process.env.DEALPILOT_AGENT_E2E_DATA_DIR;
  if (!agentDataDir) return;

  const runtimeInfoPath = path.join(agentDataDir, "agent.runtime.json");
  let token: string | undefined;
  await expect
    .poll(
      async () => {
        try {
          const runtime = JSON.parse(
            await readFile(runtimeInfoPath, "utf-8"),
          ) as {
            token?: unknown;
          };
          token = typeof runtime.token === "string" ? runtime.token : undefined;
          return Boolean(token);
        } catch {
          return false;
        }
      },
      { message: "Local Agent runtime token was not written" },
    )
    .toBe(true);

  await page.goto(`/?token=${encodeURIComponent(token!)}#/`);
});

test("本地 Customer 完整行为在桌面端和移动端保持一致", async ({
  page,
}, testInfo) => {
  test.setTimeout(90_000);

  const diagnostics = collectDiagnostics(page);
  const isMobile = testInfo.project.name.startsWith("mobile");
  const suffix = `${testInfo.project.name}-${Date.now().toString(36)}`;
  const lifecycleCustomer = `回收恢复客户-${suffix}`;
  const mergeTarget = `合并保留客户-${suffix}`;
  const mergeSource = `合并来源客户-${suffix}`;
  const migratedCompany = `迁移公司-${suffix}`;

  await test.step("创建客户，刷新详情后数据仍然存在", async () => {
    await createCustomer(page, { name: lifecycleCustomer });

    await page.reload();
    await expectCustomerHeading(page, lifecycleCustomer);
    await expect(
      page.getByText("关联信息暂不可用", { exact: true }),
    ).toHaveCount(0);
    await assertResponsivePage(page, isMobile);
  });

  await test.step("客户详情成功展示全部关联摘要", async () => {
    await expect(
      page.getByRole("heading", { name: "客户关联信息", exact: true }),
    ).toBeVisible();

    const expectedEmptyGroups = [
      ["联系人", "暂无联系人"],
      ["社媒账号", "暂无社媒账号"],
      ["项目", "暂无项目"],
      ["最近跟进", "暂无近期跟进"],
      ["未完成提醒", "暂无未完成提醒"],
    ] as const;

    for (const [groupName, emptyText] of expectedEmptyGroups) {
      const group = page.getByRole("region", {
        name: groupName,
        exact: true,
      });
      await expect(group).toBeVisible();
      await expect(group.getByText(emptyText, { exact: true })).toBeVisible();
    }
  });

  await test.step("软删除后客户离开活动列表并进入回收站", async () => {
    const actions = page.getByRole("region", {
      name: "客户操作",
      exact: true,
    });
    await expect(actions).toBeVisible();
    const softDeleteButton = actions.getByRole("button", {
      name: "移至已删除客户",
      exact: true,
    });
    await expect(softDeleteButton).toBeVisible();
    await softDeleteButton.click();

    const confirmation = page.getByRole("dialog", {
      name: `删除客户“${lifecycleCustomer}”？`,
      exact: true,
    });
    await expect(confirmation).toBeVisible();
    await confirmation
      .getByRole("button", { name: "确认删除", exact: true })
      .click();

    await expect(page).toHaveURL(/#\/companies(?:\?.*)?$/);
    await expectCustomerInActiveList(page, lifecycleCustomer, false);

    await page.goto("/#/companies/deleted");
    await expect(
      page.getByRole("heading", { name: "已删除客户", exact: true }),
    ).toBeVisible();
    const deletedRow = deletedCustomerRow(page, lifecycleCustomer);
    await expect(deletedRow).toBeVisible();
    await expect(
      page.getByText("暂时无法查看已删除客户", { exact: true }),
    ).toHaveCount(0);
    await assertResponsivePage(page, isMobile);
  });

  await test.step("恢复后客户重新出现在活动列表", async () => {
    const deletedRow = deletedCustomerRow(page, lifecycleCustomer);
    await deletedRow.getByRole("button", { name: "恢复", exact: true }).click();
    await expect(deletedRow).toHaveCount(0);

    await expectCustomerInActiveList(page, lifecycleCustomer, true);
  });

  await test.step("合并仅保留目标客户，并迁移所选字段", async () => {
    const targetId = await createCustomer(page, { name: mergeTarget });
    await createCustomer(page, {
      name: mergeSource,
      company: migratedCompany,
    });

    const actions = page.getByRole("region", {
      name: "客户操作",
      exact: true,
    });
    const mergeButton = actions.getByRole("button", {
      name: "合并",
      exact: true,
    });
    await expect(mergeButton).toBeVisible();
    await mergeButton.click();

    const mergeDialog = page.getByRole("dialog", {
      name: `合并客户“${mergeSource}”`,
      exact: true,
    });
    await expect(mergeDialog).toBeVisible();
    await mergeDialog.getByLabel("目标客户", { exact: true }).fill(mergeTarget);

    const candidateList = mergeDialog.getByRole("radiogroup").first();
    const targetCandidate = candidateList
      .locator("label")
      .filter({ hasText: mergeTarget });
    await expect(targetCandidate).toHaveCount(1);
    await targetCandidate.getByRole("radio").click();

    await mergeDialog
      .getByRole("radio", { name: "公司名称 当前客户", exact: true })
      .click();
    await mergeDialog
      .getByRole("button", { name: "确认合并", exact: true })
      .click();

    await expect(page).toHaveURL(
      new RegExp(`#/companies/${escapeRegex(targetId)}/show(?:/.*)?$`),
    );
    await expectCustomerHeading(page, mergeTarget);

    await page.goto("/#/companies");
    const targetCard = customerCard(page, mergeTarget);
    await expect(targetCard).toHaveCount(1);
    await expect(targetCard).toContainText(migratedCompany);
    await expect(customerCard(page, mergeSource)).toHaveCount(0);
    await assertResponsivePage(page, isMobile);
  });

  expect(diagnostics, diagnostics.map(formatDiagnostic).join("\n")).toEqual([]);
});

test("本地域功能在桌面端和移动端可完整操作", async ({ page }, testInfo) => {
  test.setTimeout(180_000);

  const diagnostics = collectDiagnostics(page);
  const isMobile = testInfo.project.name.startsWith("mobile");
  const suffix = `${testInfo.project.name}-${Date.now().toString(36)}`;
  const customer = `本地域客户-${suffix}`;
  const followUpNote = `首次跟进-${suffix}`;
  const updatedFollowUpNote = `已更新跟进-${suffix}`;
  const project = `重点项目-${suffix}`;
  const risk = `交付风险-${suffix}`;
  const milestone = `完成方案评审-${suffix}`;

  await createCustomer(page, { name: customer });

  await test.step("中文工作台提供本地域入口", async () => {
    await page.goto("/#/");
    await expect(
      page.getByRole("heading", { name: "今日工作台", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("region", { name: "业务概览", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("region", { name: "优先待办", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("region", { name: "快捷操作", exact: true }),
    ).toBeVisible();
    const quickActions = page.getByRole("region", {
      name: "快捷操作",
      exact: true,
    });
    await expect(
      quickActions.getByRole("link", { name: "记录跟进", exact: true }),
    ).toBeVisible();
    await expect(
      quickActions.getByRole("link", { name: "新建提醒", exact: true }),
    ).toBeVisible();
    await assertResponsivePage(page, isMobile);
  });

  await test.step("跟进记录支持创建、修改和删除", async () => {
    await page.goto("/#/follow_ups/create");
    await expect(
      page.getByRole("heading", { name: "新建跟进", exact: true }),
    ).toBeVisible();
    await selectChoice(page, "跟进类型", "电话");
    await selectAutocomplete(page, "客户", customer);
    await page
      .getByRole("textbox", { name: "备注", exact: true })
      .fill(followUpNote);
    await page.getByRole("button", { name: "保存跟进", exact: true }).click();

    await expect(page).toHaveURL(/#\/follow_ups(?:\?.*)?$/);
    let row = articleContaining(page, followUpNote);
    await expect(row).toBeVisible();
    await row.getByRole("link", { name: "编辑跟进", exact: true }).click();

    await expect(
      page.getByRole("heading", { name: "编辑跟进", exact: true }),
    ).toBeVisible();
    await page
      .getByRole("textbox", { name: "备注", exact: true })
      .fill(updatedFollowUpNote);
    await page.getByRole("button", { name: "保存跟进", exact: true }).click();

    await expect(page).toHaveURL(/#\/follow_ups(?:\?.*)?$/);
    row = articleContaining(page, updatedFollowUpNote);
    await expect(row).toBeVisible();
    await expect(articleContaining(page, followUpNote)).toHaveCount(0);
    await row.getByRole("button", { name: "删除跟进", exact: true }).click();

    const confirmation = page.getByRole("dialog").filter({
      has: page.getByRole("heading", {
        name: "确认删除这条跟进？",
        exact: true,
      }),
    });
    await expect(confirmation).toBeVisible();
    await confirmation
      .getByRole("button", { name: "删除跟进", exact: true })
      .click();
    await expect(articleContaining(page, updatedFollowUpNote)).toHaveCount(0);
    await assertResponsivePage(page, isMobile);
  });

  await test.step("提醒支持收到回复、稍后、完成和忽略", async () => {
    const reminderCustomers = {
      reply: `回复提醒客户-${suffix}`,
      later: `稍后提醒客户-${suffix}`,
      custom: `自定义稍后客户-${suffix}`,
      complete: `完成提醒客户-${suffix}`,
      ignore: `忽略提醒客户-${suffix}`,
    };

    for (const reminderCustomer of Object.values(reminderCustomers)) {
      await createCustomer(page, { name: reminderCustomer });
    }

    await createReminder(page, reminderCustomers.reply, "等待回复");
    await createReminder(page, reminderCustomers.later, "指定时间");
    await createReminder(page, reminderCustomers.custom, "指定时间");
    await createReminder(page, reminderCustomers.complete, "指定时间");
    await createReminder(page, reminderCustomers.ignore, "指定时间");

    const replyRow = articleContaining(page, reminderCustomers.reply);
    await replyRow
      .getByRole("button", { name: "已收到回复", exact: true })
      .click();
    await expect(page.getByText("提醒已更新", { exact: true })).toBeVisible();

    const laterRow = articleContaining(page, reminderCustomers.later);
    await laterRow.getByRole("button", { name: "稍后", exact: true }).click();
    await expect(laterRow.getByText("已稍后", { exact: true })).toBeVisible();

    const customRow = articleContaining(page, reminderCustomers.custom);
    await customRow
      .getByRole("button", { name: "自定义稍后", exact: true })
      .click();
    await customRow
      .getByRole("textbox", { name: "稍后提醒时间", exact: true })
      .fill(futureDateTimeLocal(48));
    await customRow
      .getByRole("button", { name: "确认稍后提醒", exact: true })
      .click();
    await expect(customRow.getByText("已稍后", { exact: true })).toBeVisible();

    const completeRow = articleContaining(page, reminderCustomers.complete);
    await completeRow
      .getByRole("button", { name: "完成", exact: true })
      .click();
    await expect(
      completeRow.getByText("已完成", { exact: true }),
    ).toBeVisible();
    await expect(completeRow.getByRole("button", { name: "完成" })).toHaveCount(
      0,
    );

    const ignoreRow = articleContaining(page, reminderCustomers.ignore);
    await ignoreRow.getByRole("button", { name: "忽略", exact: true }).click();
    await expect(ignoreRow.getByText("已忽略", { exact: true })).toBeVisible();
    await assertResponsivePage(page, isMobile);
  });

  await test.step("项目商业字段、风险和里程碑可维护", async () => {
    await page.goto("/#/deals/create");
    const createDialog = page.getByRole("dialog").filter({
      has: page.getByRole("heading", { name: "新建项目", exact: true }),
    });
    await expect(createDialog).toBeVisible();
    await createDialog
      .getByRole("textbox", { name: "项目名称", exact: true })
      .fill(project);
    await createDialog
      .getByRole("textbox", { name: "项目说明", exact: true })
      .fill(`项目说明-${suffix}`);
    await selectAutocomplete(page, "关联客户", customer);
    await createDialog
      .getByRole("spinbutton", { name: "项目金额", exact: true })
      .fill("125000");
    await createDialog
      .getByRole("textbox", { name: "币种", exact: true })
      .fill("CNY");
    await createDialog
      .getByRole("spinbutton", { name: "成交概率（%）", exact: true })
      .fill("65");
    await selectChoice(page, "项目评级", "A");
    await createDialog
      .getByRole("textbox", { name: "失单或关闭原因", exact: true })
      .fill(`商业评审记录-${suffix}`);
    await createDialog
      .getByRole("button", { name: "保存", exact: true })
      .click();

    await expect(page).toHaveURL(/#\/deals(?:\?.*)?$/);
    await page.getByText(new RegExp(`${escapeRegex(project)}$`)).click();

    const showDialog = page.getByRole("dialog").filter({
      has: page.getByRole("heading", { name: project, exact: true }),
    });
    await expect(showDialog).toBeVisible();
    await expect(
      showDialog.getByText("项目评级", { exact: true }).locator(".."),
    ).toContainText("A");
    await expect(
      showDialog.getByText("成交概率（%）", { exact: true }).locator(".."),
    ).toContainText("65%");
    await expect(showDialog.getByText(/¥.*(?:125|12\.5)/)).toBeVisible();
    await expect(
      showDialog.getByText(`商业评审记录-${suffix}`, { exact: true }),
    ).toBeVisible();

    const risks = showDialog.getByRole("region", {
      name: "项目风险",
      exact: true,
    });
    await risks.getByRole("button", { name: "添加风险", exact: true }).click();
    await risks
      .getByRole("textbox", { name: "风险描述", exact: true })
      .fill(risk);
    await risks
      .getByRole("combobox", { name: "严重程度", exact: true })
      .selectOption({ label: "高" });
    await risks.getByRole("button", { name: "保存风险", exact: true }).click();
    await expect(risks.getByText(risk, { exact: true })).toBeVisible();
    const riskStatus = risks.getByRole("combobox", {
      name: "更新风险状态",
      exact: true,
    });
    await riskStatus.selectOption({ label: "已解决" });
    await expect(riskStatus).toHaveValue("resolved");

    const milestones = showDialog.getByRole("region", {
      name: "项目里程碑",
      exact: true,
    });
    await milestones
      .getByRole("button", { name: "添加里程碑", exact: true })
      .click();
    await milestones
      .getByRole("textbox", { name: "里程碑名称", exact: true })
      .fill(milestone);
    await milestones
      .getByRole("button", { name: "保存里程碑", exact: true })
      .click();
    await expect(
      milestones.getByText(milestone, { exact: true }),
    ).toBeVisible();
    const completed = milestones.getByRole("checkbox", {
      name: "切换里程碑完成状态",
      exact: true,
    });
    await completed.click();
    await expect(completed).toBeChecked();
    await assertResponsivePage(page, isMobile);
  });

  expect(diagnostics, diagnostics.map(formatDiagnostic).join("\n")).toEqual([]);
});

const createCustomer = async (page: Page, draft: CustomerDraft) => {
  await page.goto("/#/companies/create");
  await page
    .getByRole("textbox", { name: "客户名称", exact: true })
    .fill(draft.name);
  if (draft.company) {
    await page
      .getByRole("textbox", { name: "公司名称", exact: true })
      .fill(draft.company);
  }
  await page.getByRole("button", { name: "创建客户", exact: true }).click();

  await expect(page).toHaveURL(/#\/companies\/[^/]+\/show(?:\/.*)?$/);
  await expectCustomerHeading(page, draft.name);

  const match = page.url().match(/#\/companies\/([^/]+)\/show/);
  expect(match, `无法从客户详情 URL 提取客户 ID: ${page.url()}`).not.toBeNull();
  return decodeURIComponent(match![1]);
};

const createReminder = async (
  page: Page,
  customer: string,
  type: "指定时间" | "等待回复",
) => {
  await page.goto("/#/reminders/create");
  await expect(
    page.getByRole("heading", { name: "新建提醒", exact: true }),
  ).toBeVisible();
  await selectAutocomplete(page, "客户", customer);
  await selectChoice(page, "提醒类型", type);
  await page.getByRole("button", { name: "保存提醒", exact: true }).click();
  await expect(page).toHaveURL(/#\/reminders(?:\?.*)?$/);
  await expect(articleContaining(page, customer)).toBeVisible();
};

const selectAutocomplete = async (
  page: Page,
  label: string,
  option: string,
) => {
  if ((await page.getByRole("dialog").count()) === 0) {
    await dismissNotifications(page);
  }
  const trigger = page.getByRole("combobox", { name: label, exact: true });
  await trigger.click();
  const search = page.getByRole("combobox").last();
  await expect(search).toBeVisible();
  await search.fill(option);
  await expect(
    page.getByRole("option", { name: option, exact: true }),
  ).toBeVisible();
  await page.getByRole("option", { name: option, exact: true }).click();
  await expect(trigger).toContainText(option);
};

const dismissNotifications = async (page: Page) => {
  const closeButtons = page.getByRole("button", { name: "Close toast" });
  await closeButtons.evaluateAll((buttons) =>
    buttons.forEach((button) => (button as HTMLButtonElement).click()),
  );
  await expect(closeButtons).toHaveCount(0);
};

const selectChoice = async (page: Page, label: string, option: string) => {
  const trigger = page.getByRole("combobox", { name: label, exact: true });
  await trigger.click();
  await page.getByRole("option", { name: option, exact: true }).click();
  await expect(trigger).toContainText(option);
};

const articleContaining = (page: Page, text: string) =>
  page.getByRole("article").filter({
    has: page.getByText(text, { exact: true }),
  });

const futureDateTimeLocal = (hours: number) => {
  const date = new Date(Date.now() + hours * 60 * 60 * 1000);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
};

const expectCustomerInActiveList = async (
  page: Page,
  name: string,
  visible: boolean,
) => {
  await page.goto("/#/companies");
  const card = customerCard(page, name);
  if (visible) {
    await expect(card).toHaveCount(1);
    await expect(card.getByText(name, { exact: true })).toBeVisible();
    return;
  }
  await expect(card).toHaveCount(0);
};

const expectCustomerHeading = (page: Page, name: string) =>
  expect(page.getByRole("heading", { name, exact: true })).toBeVisible();

const customerCard = (page: Page, name: string) =>
  customerCards(page).filter({
    has: page.getByText(name, { exact: true }),
  });

const customerCards = (page: Page) =>
  page.locator('#main-content a[href*="/companies/"][href$="/show"]');

const deletedCustomerRow = (page: Page, name: string): Locator =>
  page.getByRole("listitem").filter({
    has: page.getByText(name, { exact: true }),
  });

const collectDiagnostics = (page: Page) => {
  const diagnostics: BrowserDiagnostic[] = [];
  page.on("console", (message) => {
    if (message.type() === "error" || message.type() === "warning") {
      diagnostics.push({
        type: message.type() as "error" | "warning",
        text: message.text(),
      });
    }
  });
  page.on("pageerror", (error) => {
    diagnostics.push({ type: "pageerror", text: error.message });
  });
  return diagnostics;
};

const assertResponsivePage = async (page: Page, isMobile: boolean) => {
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth + 1,
      ),
    )
    .toBe(true);

  if (!isMobile) return;

  const result = await page.evaluate(() => {
    const bottomNavigation = Array.from(
      document.querySelectorAll<HTMLElement>("body > nav, body nav"),
    ).find((element) => getComputedStyle(element).position === "fixed");
    if (!bottomNavigation) {
      return {
        blocked: ["Mobile bottom navigation is missing"],
        checked: [],
      };
    }

    const navigationRect = bottomNavigation.getBoundingClientRect();
    const controls = Array.from(
      document.querySelectorAll<HTMLElement>(
        "body button, body a, body input, body select, body textarea, body [role='button']",
      ),
    )
      .filter(
        (element) =>
          element !== bottomNavigation && !bottomNavigation.contains(element),
      )
      .filter((element) => {
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return (
          style.visibility !== "hidden" &&
          style.display !== "none" &&
          rect.width > 0 &&
          rect.height > 0
        );
      });

    const blocked: string[] = [];
    for (const element of controls) {
      element.scrollIntoView({ block: "center", inline: "nearest" });
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      const isInViewport =
        rect.bottom > 0 &&
        rect.top < window.innerHeight &&
        rect.right > 0 &&
        rect.left < window.innerWidth;
      const overlapsNavigation =
        rect.bottom > navigationRect.top && rect.top < navigationRect.bottom;
      const label = `${element.tagName.toLowerCase()}:${element.getAttribute("aria-label") || element.textContent?.trim() || "unnamed"}`;

      if (
        isInViewport &&
        overlapsNavigation &&
        style.pointerEvents !== "none"
      ) {
        blocked.push(label);
      }
    }
    return { blocked, checked: controls.length };
  });

  expect(
    result.blocked,
    `Controls overlap the mobile bottom navigation: ${result.blocked.join(", ")}`,
  ).toEqual([]);
  expect(result.checked, "No mobile controls were measured").toBeGreaterThan(0);
};

const escapeRegex = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const formatDiagnostic = (diagnostic: BrowserDiagnostic) =>
  `[${diagnostic.type}] ${diagnostic.text}`;
