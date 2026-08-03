import { fileURLToPath } from "node:url";
import path from "node:path";

const DEFAULT_FUNCTIONS = ["purge-expired-customers", "delete-account"];

export async function runCloudSmoke({
  webUrl,
  supabaseUrl,
  publishableKey,
  releaseSha,
  functions = DEFAULT_FUNCTIONS,
  attempts = 12,
  retryDelayMs = 5_000,
  fetchImpl = fetch,
  authenticatedCustomer,
}) {
  const webBase = withTrailingSlash(webUrl);
  const apiBase = supabaseUrl.replace(/\/$/, "");

  await retry("Web release marker", attempts, retryDelayMs, async () => {
    const response = await fetchImpl(new URL("release.json", webBase));
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const marker = await response.json();
    if (marker.sha !== releaseSha) {
      throw new Error(
        `expected ${releaseSha}, received ${marker.sha ?? "none"}`,
      );
    }
  });

  await retry("Supabase Auth health", attempts, retryDelayMs, async () => {
    const response = await fetchImpl(`${apiBase}/auth/v1/health`, {
      headers: { apikey: publishableKey },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
  });

  await retry(
    "PostgREST anonymous access guard",
    attempts,
    retryDelayMs,
    async () => {
      const response = await fetchImpl(
        `${apiBase}/rest/v1/companies?select=id&limit=1`,
        {
          headers: { apikey: publishableKey },
        },
      );
      const payload = await readJson(response);
      if (![401, 403].includes(response.status) || payload?.code !== "42501") {
        const code =
          typeof payload?.code === "string" ? `, code ${payload.code}` : "";
        throw new Error(
          `expected HTTP 401/403 with code 42501, received HTTP ${response.status}${code}`,
        );
      }
    },
  );

  for (const functionName of functions) {
    const expectedStatuses =
      functionName === "delete-account" ? [404] : [401, 403];
    await retry(
      `Unavailable Edge function (${functionName})`,
      attempts,
      retryDelayMs,
      async () => {
        const response = await fetchImpl(
          `${apiBase}/functions/v1/${functionName}`,
          {
            method: "POST",
            headers: {
              apikey: publishableKey,
              "content-type": "application/json",
            },
            body: "{}",
          },
        );
        if (!expectedStatuses.includes(response.status)) {
          throw new Error(
            `expected ${expectedStatuses.join("/")}, received ${response.status}`,
          );
        }
      },
    );
  }

  if (authenticatedCustomer) {
    await verifyAuthenticatedCustomer({
      apiBase,
      publishableKey,
      authenticatedCustomer,
      attempts,
      retryDelayMs,
      fetchImpl,
    });
  }

  return {
    releaseSha,
    checkedFunctions: functions,
    checkedCustomerId: authenticatedCustomer?.expected.id,
  };
}

async function verifyAuthenticatedCustomer({
  apiBase,
  publishableKey,
  authenticatedCustomer,
  attempts,
  retryDelayMs,
  fetchImpl,
}) {
  const { email, password, expected } = authenticatedCustomer;
  validateExpectedCustomer(expected);

  let accessToken;
  await retry("Smoke account sign-in", attempts, retryDelayMs, async () => {
    const response = await fetchImpl(
      `${apiBase}/auth/v1/token?grant_type=password`,
      {
        method: "POST",
        headers: {
          apikey: publishableKey,
          "content-type": "application/json",
        },
        body: JSON.stringify({ email, password }),
      },
    );
    const payload = await readJson(response);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    if (typeof payload?.access_token !== "string" || !payload.access_token) {
      throw new Error("missing access token");
    }
    accessToken = payload.access_token;
  });

  const authenticatedHeaders = {
    apikey: publishableKey,
    authorization: `Bearer ${accessToken}`,
  };

  await retry(
    "Authenticated Customer count",
    attempts,
    retryDelayMs,
    async () => {
      const response = await fetchImpl(
        `${apiBase}/rest/v1/companies?select=id&deleted_at=is.null`,
        {
          headers: {
            ...authenticatedHeaders,
            Prefer: "count=exact",
            Range: "0-0",
          },
        },
      );
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const actualCount = parseContentRangeTotal(
        response.headers.get("content-range"),
      );
      if (actualCount !== expected.active_customer_count) {
        throw new Error(
          `expected ${expected.active_customer_count}, received ${actualCount}`,
        );
      }
    },
  );

  await retry(
    "Authenticated Customer detail summary",
    attempts,
    retryDelayMs,
    async () => {
      const response = await fetchImpl(
        `${apiBase}/rest/v1/rpc/get_customer_detail`,
        {
          method: "POST",
          headers: {
            ...authenticatedHeaders,
            "content-type": "application/json",
          },
          body: JSON.stringify({ p_customer_id: expected.id }),
        },
      );
      const payload = await readJson(response);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const customer = payload?.data;
      if (customer?.id !== expected.id || customer?.name !== expected.name) {
        throw new Error("Customer identity does not match the smoke baseline");
      }
      for (const field of CUSTOMER_SUMMARY_FIELDS) {
        if (!Array.isArray(customer[field])) {
          throw new Error(`Customer summary field ${field} is not an array`);
        }
        if (customer[field].length !== expected[field]) {
          throw new Error(
            `Customer summary ${field} expected ${expected[field]}, received ${customer[field].length}`,
          );
        }
      }
    },
  );
}

const CUSTOMER_SUMMARY_FIELDS = [
  "contacts",
  "social_accounts",
  "deals",
  "recent_follow_ups",
  "open_reminders",
];

function validateExpectedCustomer(expected) {
  if (!expected || typeof expected !== "object") {
    throw new Error("CLOUD_SMOKE_EXPECTED_CUSTOMER_JSON must be an object");
  }
  if (typeof expected.id !== "string" || typeof expected.name !== "string") {
    throw new Error("Customer smoke baseline requires string id and name");
  }
  for (const field of ["active_customer_count", ...CUSTOMER_SUMMARY_FIELDS]) {
    if (!Number.isInteger(expected[field]) || expected[field] < 0) {
      throw new Error(`Customer smoke baseline ${field} must be an integer`);
    }
  }
}

function parseContentRangeTotal(contentRange) {
  const match = contentRange?.match(/\/(\d+)$/);
  if (!match) throw new Error("missing exact Content-Range total");
  return Number(match[1]);
}

async function readJson(response) {
  try {
    return await response.json();
  } catch {
    throw new Error(`HTTP ${response.status} returned invalid JSON`);
  }
}

async function retry(label, attempts, delayMs, operation) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await operation();
      console.log(`PASS ${label}`);
      return;
    } catch (error) {
      lastError = error;
      if (attempt < attempts)
        await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw new Error(`${label} failed after ${attempts} attempts`, {
    cause: lastError,
  });
}

function withTrailingSlash(value) {
  return value.endsWith("/") ? value : `${value}/`;
}

async function main() {
  const required = [
    "CLOUD_WEB_URL",
    "SUPABASE_URL",
    "SUPABASE_PUBLISHABLE_KEY",
    "RELEASE_SHA",
  ];
  for (const name of required) {
    if (!process.env[name]) throw new Error(`${name} is required`);
  }

  const requireAuthenticated =
    process.env.CLOUD_SMOKE_REQUIRE_AUTHENTICATED === "true";
  let authenticatedCustomer;
  if (requireAuthenticated) {
    for (const name of [
      "CLOUD_SMOKE_EMAIL",
      "CLOUD_SMOKE_PASSWORD",
      "CLOUD_SMOKE_EXPECTED_CUSTOMER_JSON",
    ]) {
      if (!process.env[name]) throw new Error(`${name} is required`);
    }
    authenticatedCustomer = {
      email: process.env.CLOUD_SMOKE_EMAIL,
      password: process.env.CLOUD_SMOKE_PASSWORD,
      expected: JSON.parse(process.env.CLOUD_SMOKE_EXPECTED_CUSTOMER_JSON),
    };
  }

  const result = await runCloudSmoke({
    webUrl: process.env.CLOUD_WEB_URL,
    supabaseUrl: process.env.SUPABASE_URL,
    publishableKey: process.env.SUPABASE_PUBLISHABLE_KEY,
    releaseSha: process.env.RELEASE_SHA,
    functions: (
      process.env.CLOUD_SMOKE_FUNCTIONS ?? DEFAULT_FUNCTIONS.join(",")
    )
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
    authenticatedCustomer,
  });
  console.log(`Cloud smoke passed for ${result.releaseSha}.`);
}

if (path.resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
