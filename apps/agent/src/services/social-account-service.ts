import { normalizePlatformIdentifier } from "@dealpilot/shared";
import type {
  SocialAccountCreate,
  SocialAccountListQuery,
} from "@dealpilot/shared";
import { ApiError } from "../errors/api-error";
import {
  deleteSocialAccountRecord,
  findActiveCustomer,
  findSocialAccount,
  insertSocialAccount,
  listSocialAccountRecords,
  listSocialAccounts,
} from "../repositories/crm-repository";
import { toCursorPage } from "./pagination";

async function requireCustomer(customerId: string) {
  if (!(await findActiveCustomer(customerId))) {
    throw ApiError.notFound("Customer not found");
  }
}

export async function getSocialAccounts(customerId: string) {
  await requireCustomer(customerId);
  return listSocialAccounts(customerId);
}

export async function listSocialAccountsPage(query: SocialAccountListQuery) {
  return toCursorPage(await listSocialAccountRecords(query), query.limit);
}

export async function createSocialAccount(
  customerId: string,
  input: SocialAccountCreate,
) {
  await requireCustomer(customerId);
  const normalized = normalizePlatformIdentifier(
    input.platform,
    input.raw_identifier,
  );
  if (await findSocialAccount(input.platform, normalized)) {
    throw ApiError.conflict("Social account already bound to a customer");
  }
  return insertSocialAccount(customerId, input, normalized);
}

export function deleteSocialAccount(accountId: string) {
  return deleteSocialAccountRecord(accountId);
}
