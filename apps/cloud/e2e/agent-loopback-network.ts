import { expect, type Page, type TestInfo } from "@playwright/test";

type HttpRequestEvidence = {
  method: string;
  resource_type: string;
  url: string;
};

type LoopbackNetworkEvidence = {
  policy: "http(s) requests may only target 127.0.0.1 or localhost";
  allowed_loopback_requests: HttpRequestEvidence[];
  blocked_external_requests: HttpRequestEvidence[];
};

const evidenceByPage = new WeakMap<Page, LoopbackNetworkEvidence>();
const allowedHosts = new Set(["127.0.0.1", "localhost"]);

export async function installAgentLoopbackNetworkGuard(page: Page) {
  if (!process.env.DEALPILOT_AGENT_E2E_DATA_DIR) return;

  const evidence: LoopbackNetworkEvidence = {
    policy: "http(s) requests may only target 127.0.0.1 or localhost",
    allowed_loopback_requests: [],
    blocked_external_requests: [],
  };
  evidenceByPage.set(page, evidence);

  await page.context().route(/^https?:\/\//, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const entry: HttpRequestEvidence = {
      method: request.method(),
      resource_type: request.resourceType(),
      url: `${url.origin}${url.pathname}`,
    };

    if (allowedHosts.has(url.hostname.toLowerCase())) {
      evidence.allowed_loopback_requests.push(entry);
      await route.continue();
      return;
    }

    evidence.blocked_external_requests.push(entry);
    await route.abort("blockedbyclient");
  });
}

export async function assertAgentUsedLoopbackOnly(
  page: Page,
  testInfo: TestInfo,
) {
  const evidence = evidenceByPage.get(page);
  if (!evidence) return;

  await testInfo.attach("agent-loopback-network-evidence", {
    body: Buffer.from(JSON.stringify(evidence, null, 2)),
    contentType: "application/json",
  });
  expect(
    evidence.allowed_loopback_requests.length,
    "The real Agent E2E did not observe any loopback HTTP(S) traffic",
  ).toBeGreaterThan(0);
  expect(
    evidence.allowed_loopback_requests.filter((request) => {
      const url = new URL(request.url);
      // In development the browser uses the Vite same-origin /api proxy;
      // production serves the same routes directly from the Agent process.
      return url.pathname.startsWith("/api/");
    }).length,
    "The browser did not make any business request to the real local Agent API",
  ).toBeGreaterThan(0);
  expect(
    evidence.blocked_external_requests,
    `External HTTP(S) requests were blocked: ${JSON.stringify(evidence.blocked_external_requests)}`,
  ).toEqual([]);
}
