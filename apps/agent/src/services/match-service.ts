import { normalizePlatformIdentifier } from "@dealpilot/shared";
import type { MatchBind, MatchResolve, MatchResolveResponse } from "@dealpilot/shared";
import { ApiError } from "../errors/api-error";
import {
  deleteBinding,
  findActiveCustomer,
  findMatchingCustomers,
  upsertManualBinding,
} from "../repositories/crm-repository";

export async function resolveMatch(input: MatchResolve): Promise<MatchResolveResponse> {
  const normalized = normalizePlatformIdentifier(input.platform, input.raw_identifier);
  const bindings = await findMatchingCustomers(input.platform, normalized);
  if (bindings.length === 0) return { status: "none" };
  if (bindings.length === 1) return { status: "unique", customer: bindings[0].customer };
  return { status: "multiple", candidates: bindings.map(({ customer }) => customer) };
}

export async function bindMatch(input: MatchBind) {
  if (!await findActiveCustomer(input.customer_id)) {
    throw ApiError.notFound("Customer not found");
  }
  const normalized = normalizePlatformIdentifier(input.platform, input.raw_identifier);
  return upsertManualBinding(
    input.customer_id,
    input.platform,
    input.raw_identifier,
    normalized,
  );
}

export function unbindMatch(platform: string, rawIdentifier: string) {
  const normalized = normalizePlatformIdentifier(platform, rawIdentifier);
  return deleteBinding(platform, normalized);
}
