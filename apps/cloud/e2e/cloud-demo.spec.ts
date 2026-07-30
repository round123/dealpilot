import { expect, test, type Page } from "@playwright/test";

type BrowserDiagnostic = {
  type: "error" | "warning" | "pageerror";
  text: string;
};

test("demo Customer journey remains reachable and responsive", async ({
  page,
}, testInfo) => {
  const diagnostics = collectDiagnostics(page);
  const isMobile = testInfo.project.name.startsWith("mobile");

  await test.step("Dashboard", async () => {
    await page.goto("/#/");
    await expect(page.locator("#main-content")).toBeVisible();
    if (isMobile) {
      await expect(
        page.getByRole("heading", { name: "DealPilot" }),
      ).toBeVisible();
    } else {
      await expect(page.getByRole("link", { name: "仪表盘" })).toBeVisible();
    }
    await assertResponsivePage(page, isMobile);
  });

  await test.step("Customer list", async () => {
    await page.goto("/#/companies");
    await expect(page.getByRole("link", { name: "新建客户" })).toBeVisible();
    await expect(customerCards(page).first()).toBeVisible();
    const checkedControls = await assertResponsivePage(page, isMobile);
    assertMobileControlsMeasured(checkedControls, isMobile, "Customer list");
  });

  await test.step("Customer create", async () => {
    await page.goto("/#/companies/create");
    await expect(page.getByLabel("客户名称")).toBeVisible();
    await expect(page.getByRole("button", { name: "创建客户" })).toBeVisible();
    const checkedControls = await assertResponsivePage(page, isMobile);
    assertMobileControlsMeasured(checkedControls, isMobile, "Customer create");
  });

  await test.step("deep Customer list opens detail at the top", async () => {
    await page.goto("/#/companies");
    const cards = customerCards(page);
    await expect(cards.first()).toBeVisible();
    await page.evaluate(() =>
      window.scrollTo(0, document.documentElement.scrollHeight),
    );
    await expect
      .poll(() => page.evaluate(() => window.scrollY))
      .toBeGreaterThan(0);

    await cards.last().click();
    await expect(page).toHaveURL(/#\/companies\/[^/]+\/show(?:\/.*)?$/);
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
    await expect(
      page.getByText("关联信息暂不可用", { exact: true }),
    ).toBeVisible();
    if (isMobile) {
      const customerActions = page.getByRole("region", {
        name: "客户操作",
      });
      await expect(customerActions).toBeVisible();
      await expect(
        customerActions.getByRole("link", { name: "编辑客户" }),
      ).toBeVisible();
    }
    const checkedControls = await assertResponsivePage(page, isMobile);
    assertMobileControlsMeasured(checkedControls, isMobile, "Customer detail");
  });

  await test.step("Deleted Customers exposes the parseable demo error state", async () => {
    await page.goto("/#/companies/deleted");
    await expect(
      page.getByRole("heading", { name: "已删除客户" }),
    ).toBeVisible();
    await expect(
      page.getByText("暂时无法查看已删除客户", { exact: true }),
    ).toBeVisible();
    const checkedControls = await assertResponsivePage(page, isMobile);
    assertMobileControlsMeasured(
      checkedControls,
      isMobile,
      "Deleted Customers",
    );
    if (isMobile) {
      expect(checkedControls).toContain("a:返回客户列表");
    }
  });

  expect(diagnostics, diagnostics.map(formatDiagnostic).join("\n")).toEqual([]);
});

const customerCards = (page: Page) =>
  page.locator('#main-content a[href*="/companies/"][href$="/show"]');

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

  if (!isMobile) return [];

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
    const checked: string[] = [];
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

      checked.push(label);

      if (
        isInViewport &&
        overlapsNavigation &&
        style.pointerEvents !== "none"
      ) {
        blocked.push(label);
      }
    }
    return { blocked, checked };
  });

  expect(
    result.blocked,
    `Controls overlap the mobile bottom navigation: ${result.blocked.join(", ")}`,
  ).toEqual([]);
  return result.checked;
};

const assertMobileControlsMeasured = (
  checkedControls: string[],
  isMobile: boolean,
  pageName: string,
) => {
  if (!isMobile) return;
  expect(
    checkedControls.length,
    `No mobile controls were measured on ${pageName}`,
  ).toBeGreaterThan(0);
};

const formatDiagnostic = (diagnostic: BrowserDiagnostic) =>
  `[${diagnostic.type}] ${diagnostic.text}`;
