import type {
  CustomerCreate,
  CustomerListQuery,
  CustomerMerge,
  CustomerUpdate,
} from "@dealpilot/shared";
import { ApiError } from "../errors/api-error";
import {
  findCustomer,
  getCustomerDetail,
  insertCustomer,
  listCustomers as listCustomerRecords,
  mergeCustomerRecords,
  restoreCustomerRecord,
  softDeleteCustomerRecord,
  updateCustomerRecord,
} from "../repositories/crm-repository";
import { toCursorPage } from "./pagination";

export async function listCustomers(query: CustomerListQuery) {
  return toCursorPage(await listCustomerRecords(query), query.limit);
}

export function createCustomer(input: CustomerCreate) {
  return insertCustomer(input);
}

export async function getCustomer(customerId: string) {
  const customer = await getCustomerDetail(customerId);
  if (!customer) throw ApiError.notFound("Customer not found");
  return customer;
}

export async function updateCustomer(customerId: string, input: CustomerUpdate) {
  const customer = await updateCustomerRecord(customerId, input);
  if (!customer) throw ApiError.notFound("Customer not found");
  return customer;
}

export async function softDeleteCustomer(customerId: string): Promise<void> {
  if (!await softDeleteCustomerRecord(customerId)) {
    throw ApiError.notFound("Customer not found");
  }
}

export async function restoreCustomer(customerId: string) {
  const result = await restoreCustomerRecord(customerId);
  if (result.status === "not_found") throw ApiError.notFound("Customer not found");
  if (result.status === "not_deleted") throw ApiError.conflict("Customer is not deleted");
  return result.customer;
}

export async function mergeCustomers(input: CustomerMerge) {
  if (input.source_id === input.target_id) {
    throw ApiError.badRequest("Source and target cannot be the same");
  }

  const source = await findCustomer(input.source_id);
  if (!source) throw ApiError.notFound("Source customer not found");
  if (!await findCustomer(input.target_id)) {
    throw ApiError.notFound("Target customer not found");
  }

  const updates: Parameters<typeof mergeCustomerRecords>[2] = {};
  for (const [field, choice] of Object.entries(input.field_resolutions ?? {})) {
    if (choice !== "source") continue;
    if (field === "name") updates.name = source.name;
    if (field === "company") updates.company = source.company;
    if (field === "country") updates.country = source.country;
    if (field === "source") updates.source = source.source;
    if (field === "grade") updates.grade = source.grade;
    if (field === "status") updates.status = source.status;
  }

  const result = await mergeCustomerRecords(input.source_id, input.target_id, updates);
  if (result.status === "source_not_found") throw ApiError.notFound("Source customer not found");
  if (result.status === "target_not_found") throw ApiError.notFound("Target customer not found");
  return result.customer;
}
