export const readJwtRole = (
  authorization: string | null,
): string | undefined => {
  const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  const payload = token?.split(".")[1];
  if (!payload) return undefined;

  try {
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    return JSON.parse(atob(padded)).role;
  } catch {
    return undefined;
  }
};

export const hasServiceRole = (authorization: string | null): boolean =>
  readJwtRole(authorization) === "service_role";
