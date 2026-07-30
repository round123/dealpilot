export const SUPABASE_E2E_PORT = 4188;

export const SUPABASE_E2E_USERS = {
  alpha: {
    email: "dealpilot.e2e.alpha@example.test",
    password: "DealPilot-E2E-Alpha-2026!",
    displayName: "E2E Alpha",
    customerId: "e2e00000-0000-4000-8000-000000000001",
    customerName: "Alpha Isolation Customer",
  },
  beta: {
    email: "dealpilot.e2e.beta@example.test",
    password: "DealPilot-E2E-Beta-2026!",
    displayName: "E2E Beta",
    customerId: "e2e00000-0000-4000-8000-000000000002",
    customerName: "Beta Isolation Customer",
  },
} as const;

const LOCAL_SUPABASE_HOSTS = new Set(["localhost", "127.0.0.1"]);

const requireEnvironment = (names: string[]) => {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }
  throw new Error(
    `Missing required environment variable: ${names.join(" or ")}`,
  );
};

export const requireLocalSupabaseUrl = () => {
  const value = requireEnvironment(["SUPABASE_URL", "API_URL"]);
  const url = new URL(value);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    !LOCAL_SUPABASE_HOSTS.has(url.hostname)
  ) {
    throw new Error(
      `Supabase isolation E2E only permits localhost or 127.0.0.1, received ${url.origin}`,
    );
  }
  return url.origin;
};

export const requireSupabasePublicEnvironment = () => ({
  url: requireLocalSupabaseUrl(),
  anonKey: requireEnvironment(["SUPABASE_ANON_KEY", "ANON_KEY"]),
});

export const requireSupabaseAdminEnvironment = () => ({
  ...requireSupabasePublicEnvironment(),
  serviceRoleKey: requireEnvironment([
    "SUPABASE_SERVICE_ROLE_KEY",
    "SERVICE_ROLE_KEY",
  ]),
});

export const requireSeededUserIds = () => ({
  alpha: requireEnvironment(["SUPABASE_E2E_ALPHA_USER_ID"]),
  beta: requireEnvironment(["SUPABASE_E2E_BETA_USER_ID"]),
});
