import { hasServiceRole } from "./auth.ts";

const jwtForRole = (role: string) => {
  const encode = (value: unknown) =>
    btoa(JSON.stringify(value))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
  return `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ role })}.signature`;
};

Deno.test("rejects a missing authorization token", () => {
  if (hasServiceRole(null)) throw new Error("missing token was accepted");
});

Deno.test("rejects an authenticated browser token", () => {
  if (hasServiceRole(`Bearer ${jwtForRole("authenticated")}`)) {
    throw new Error("authenticated token was accepted");
  }
});

Deno.test("accepts a gateway-verified service-role token", () => {
  if (!hasServiceRole(`Bearer ${jwtForRole("service_role")}`)) {
    throw new Error("service-role token was rejected");
  }
});
