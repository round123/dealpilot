import { expect, test, type Page } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const cloudRoot = path.dirname(fileURLToPath(import.meta.url));
const serviceWorkerPath = path.resolve(cloudRoot, "../dist/sw.js");
const manifestPath = path.resolve(cloudRoot, "../dist/manifest.json");
const VERSION_REQUEST = "DEALPILOT_PWA_VERSION_REQUEST";
const VERSION_RESPONSE = "DEALPILOT_PWA_VERSION_RESPONSE";
const CACHE_VERSION_FIELD = "dealpilot_pwa_test_version";

const serviceWorkerWithVersion = (source: string, version: string) => {
  const revision = `dealpilot-pwa-${version}`;
  const revisedSource = source.replace(
    /(url:"manifest\.json",revision:)"[^"]+"/,
    `$1"${revision}"`,
  );
  if (revisedSource === source) {
    throw new Error("Generated service worker has no manifest precache entry");
  }

  return `${revisedSource}
self.addEventListener("message", (event) => {
  if (event.data?.type === "${VERSION_REQUEST}") {
    event.source?.postMessage({ type: "${VERSION_RESPONSE}", version: "${version}" });
  }
});
`;
};

const manifestWithVersion = (source: string, version: string) =>
  JSON.stringify(
    {
      ...(JSON.parse(source) as Record<string, unknown>),
      [CACHE_VERSION_FIELD]: version,
    },
    null,
    2,
  );

const controllerVersion = (page: Page) =>
  page.evaluate(
    ({ requestType, responseType }) =>
      new Promise<string | null>((resolve) => {
        const controller = navigator.serviceWorker.controller;
        if (!controller) {
          resolve(null);
          return;
        }
        const timeout = window.setTimeout(() => {
          navigator.serviceWorker.removeEventListener("message", onMessage);
          resolve(null);
        }, 1_000);
        const onMessage = (event: MessageEvent) => {
          if (event.data?.type !== responseType) return;
          window.clearTimeout(timeout);
          navigator.serviceWorker.removeEventListener("message", onMessage);
          resolve(
            typeof event.data.version === "string" ? event.data.version : null,
          );
        };
        navigator.serviceWorker.addEventListener("message", onMessage);
        controller.postMessage({ type: requestType });
      }),
    { requestType: VERSION_REQUEST, responseType: VERSION_RESPONSE },
  );

const cachedManifestEntries = (page: Page) =>
  page.evaluate(async () => {
    const entries: Array<{ cacheName: string; url: string }> = [];
    for (const cacheName of await caches.keys()) {
      const cache = await caches.open(cacheName);
      for (const request of await cache.keys()) {
        if (new URL(request.url).pathname.endsWith("/manifest.json")) {
          entries.push({ cacheName, url: request.url });
        }
      }
    }
    return entries;
  });

const fetchedManifestVersion = (page: Page) =>
  page.evaluate(async (versionField) => {
    const response = await fetch("./manifest.json");
    const manifest = (await response.json()) as Record<string, unknown>;
    return manifest[versionField] ?? null;
  }, CACHE_VERSION_FIELD);

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

test("service worker activates a new version and replaces the old precache", async ({
  context,
  page,
}) => {
  test.setTimeout(60_000);
  const originalServiceWorker = await readFile(serviceWorkerPath, "utf8");
  const originalManifest = await readFile(manifestPath, "utf8");

  try {
    await writeFile(
      manifestPath,
      manifestWithVersion(originalManifest, "v1"),
      "utf8",
    );
    await writeFile(
      serviceWorkerPath,
      serviceWorkerWithVersion(originalServiceWorker, "v1"),
      "utf8",
    );
    await page.goto("/");
    await page.evaluate(() => navigator.serviceWorker.ready);
    await expect
      .poll(() => controllerVersion(page), { timeout: 15_000 })
      .toBe("v1");
    await expect.poll(() => fetchedManifestVersion(page)).toBe("v1");

    const v1ManifestEntries = await cachedManifestEntries(page);
    expect(v1ManifestEntries).toEqual([
      expect.objectContaining({
        url: expect.stringContaining(
          "manifest.json?__WB_REVISION__=dealpilot-pwa-v1",
        ),
      }),
    ]);

    await page.evaluate(() => {
      const state = window as typeof window & {
        __dealpilotControllerChanges?: number;
      };
      state.__dealpilotControllerChanges = 0;
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        state.__dealpilotControllerChanges =
          (state.__dealpilotControllerChanges ?? 0) + 1;
      });
    });
    await writeFile(
      manifestPath,
      manifestWithVersion(originalManifest, "v2"),
      "utf8",
    );
    await writeFile(
      serviceWorkerPath,
      serviceWorkerWithVersion(originalServiceWorker, "v2"),
      "utf8",
    );

    await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.getRegistration();
      if (!registration)
        throw new Error("Service worker registration is missing");
      await registration.update();
    });

    await expect
      .poll(() => controllerVersion(page), { timeout: 30_000 })
      .toBe("v2");
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            (
              window as typeof window & {
                __dealpilotControllerChanges?: number;
              }
            ).__dealpilotControllerChanges ?? 0,
        ),
      )
      .toBeGreaterThan(0);
    await expect
      .poll(() =>
        page.evaluate(async () => {
          const registration = await navigator.serviceWorker.getRegistration();
          return {
            active: registration?.active?.state,
            waiting: registration?.waiting?.state ?? null,
          };
        }),
      )
      .toEqual({ active: "activated", waiting: null });

    await expect.poll(() => fetchedManifestVersion(page)).toBe("v2");
    await expect
      .poll(() => cachedManifestEntries(page))
      .toEqual([
        expect.objectContaining({
          url: expect.stringContaining(
            "manifest.json?__WB_REVISION__=dealpilot-pwa-v2",
          ),
        }),
      ]);

    await context.setOffline(true);
    await expect(fetchedManifestVersion(page)).resolves.toBe("v2");
  } finally {
    await context.setOffline(false);
    await writeFile(manifestPath, originalManifest, "utf8");
    await writeFile(serviceWorkerPath, originalServiceWorker, "utf8");
  }
});
