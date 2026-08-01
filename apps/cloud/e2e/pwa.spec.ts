import { expect, test } from "@playwright/test";

interface WebAppManifest {
  id?: unknown;
  name?: unknown;
  short_name?: unknown;
  description?: unknown;
  lang?: unknown;
  start_url?: unknown;
  scope?: unknown;
  display?: unknown;
  theme_color?: unknown;
  background_color?: unknown;
  icons?: Array<{
    src?: unknown;
    sizes?: unknown;
    type?: unknown;
    purpose?: unknown;
  }>;
}

test("production manifest contains the installable DealPilot metadata", async ({
  request,
}) => {
  const response = await request.get("/manifest.json");
  expect(response.ok()).toBe(true);
  expect(response.headers()["content-type"]).toMatch(
    /^application\/(?:manifest\+)?json\b/,
  );

  const manifest = (await response.json()) as WebAppManifest;
  expect(manifest).toMatchObject({
    id: "./",
    name: "DealPilot 外贸客户工作台",
    short_name: "DealPilot",
    lang: "zh-CN",
    start_url: "./",
    scope: "./",
    display: "standalone",
    theme_color: "#000000",
    background_color: "#ffffff",
  });
  expect(typeof manifest.description).toBe("string");

  const icons = manifest.icons ?? [];
  expect(icons).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        src: "appIcon/192.png",
        sizes: "192x192",
        type: "image/png",
      }),
      expect.objectContaining({
        src: "appIcon/512.png",
        sizes: "512x512",
        type: "image/png",
      }),
      expect.objectContaining({
        sizes: "512x512",
        purpose: "maskable",
        type: "image/png",
      }),
    ]),
  );

  for (const path of ["/appIcon/192.png", "/appIcon/512.png"]) {
    const icon = await request.get(path);
    expect(icon.ok(), `${path} should be emitted in the production build`).toBe(
      true,
    );
    expect(icon.headers()["content-type"]).toContain("image/png");
  }
});

test("registered service worker serves the cached login shell offline", async ({
  context,
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "登录", exact: true }),
  ).toBeVisible();

  await page.evaluate(() => navigator.serviceWorker.ready);
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const registration = await navigator.serviceWorker.getRegistration();
        return registration?.active?.state ?? null;
      }),
    )
    .toBe("activated");

  const registration = await page.evaluate(async () => {
    const ready = await navigator.serviceWorker.getRegistration();
    return {
      scope: ready?.scope,
      scriptURL: ready?.active?.scriptURL,
      state: ready?.active?.state,
    };
  });
  expect(registration.state).toBe("activated");
  expect(registration.scriptURL).toMatch(/\/sw\.js$/);
  expect(registration.scope).toBe("http://127.0.0.1:4190/");

  await expect
    .poll(() =>
      page.evaluate(
        () => navigator.serviceWorker.controller?.scriptURL ?? null,
      ),
    )
    .toMatch(/\/sw\.js$/);

  await context.setOffline(true);
  try {
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(
      page.getByRole("heading", { name: "登录", exact: true }),
    ).toBeVisible();
    await expect(page.locator("#root")).not.toBeEmpty();
    await expect(
      page.evaluate(async () => {
        const response = await fetch("./manifest.json");
        const manifest = (await response.json()) as WebAppManifest;
        return manifest.name;
      }),
    ).resolves.toBe("DealPilot 外贸客户工作台");
  } finally {
    await context.setOffline(false);
  }
});
