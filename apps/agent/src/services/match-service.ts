import { normalizePhone, normalizePlatformIdentifier } from "@dealpilot/shared";
import type { Customer, MatchBind, MatchResolve, MatchResolveResponse } from "@dealpilot/shared";
import { ApiError } from "../errors/api-error";
import {
  deleteBinding,
  findActiveCustomer,
  findManualBindingCustomers,
  findPhoneMatchingCustomers,
  findPlatformMatchingCustomers,
  upsertManualBinding,
} from "../repositories/crm-repository";
import {
  recordAutomaticMatchCorrection,
  recordAutomaticMatchObservation,
} from "../repositories/metrics-repository";

export async function resolveMatch(input: MatchResolve): Promise<MatchResolveResponse> {
  const normalized = normalizePlatformIdentifier(input.platform, input.raw_identifier);
  const manualBindings = await findManualBindingCustomers(input.platform, normalized);
  if (manualBindings.length > 0) return matchResponse(manualBindings);

  const phone = normalizePhone(input.platform === "whatsapp" ? normalized : input.raw_identifier);
  if (phone && /^\+[1-9]\d{6,14}$/.test(phone)) {
    const phoneMatches = await findPhoneMatchingCustomers(phone);
    if (phoneMatches.length > 0) {
      if (phoneMatches.length === 1) {
        recordAutomaticMatchObservation(
          input.platform,
          normalized,
          phoneMatches[0].customer.id,
        );
      }
      return matchResponse(phoneMatches);
    }
  }

  const platformMatches = await findPlatformMatchingCustomers(input.platform, normalized);
  if (platformMatches.length > 0) {
    if (platformMatches.length === 1) {
      recordAutomaticMatchObservation(
        input.platform,
        normalized,
        platformMatches[0].customer.id,
      );
    }
    return matchResponse(platformMatches);
  }
  return { status: "none" };
}

function matchResponse(
  matches: Array<{ customer: Customer }>,
): MatchResolveResponse {
  if (matches.length === 1) return { status: "unique", customer: matches[0].customer };
  return { status: "multiple", candidates: matches.map(({ customer }) => customer) };
}

export async function bindMatch(input: MatchBind) {
  if (!await findActiveCustomer(input.customer_id)) {
    throw ApiError.notFound("Customer not found");
  }
  const normalized = normalizePlatformIdentifier(input.platform, input.raw_identifier);
  const binding = await upsertManualBinding(
    input.customer_id,
    input.platform,
    input.raw_identifier,
    normalized,
  );
  recordAutomaticMatchCorrection(input.platform, normalized, input.customer_id);
  return binding;
}

export function unbindMatch(platform: string, rawIdentifier: string) {
  const normalized = normalizePlatformIdentifier(platform, rawIdentifier);
  return deleteBinding(platform, normalized);
}
