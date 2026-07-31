import { normalizeEmail, normalizePhone } from "@dealpilot/shared";
import type {
  ContactCreate,
  ContactListQuery,
  ContactUpdate,
} from "@dealpilot/shared";
import { ApiError } from "../errors/api-error";
import {
  deleteContactRecord,
  findActiveCustomer,
  insertContact,
  listContactRecords,
  listContacts,
  updateContactRecord,
} from "../repositories/crm-repository";
import { toCursorPage } from "./pagination";

async function requireCustomer(customerId: string) {
  if (!(await findActiveCustomer(customerId))) {
    throw ApiError.notFound("Customer not found");
  }
}

export async function getContacts(customerId: string) {
  await requireCustomer(customerId);
  return listContacts(customerId);
}

export async function listContactsPage(query: ContactListQuery) {
  return toCursorPage(await listContactRecords(query), query.limit);
}

export async function createContact(customerId: string, input: ContactCreate) {
  await requireCustomer(customerId);
  return insertContact(customerId, {
    ...input,
    email: normalizeEmail(input.email) ?? undefined,
    phone: normalizePhone(input.phone) ?? undefined,
  });
}

export async function updateContact(contactId: string, input: ContactUpdate) {
  const normalized: ContactUpdate = { ...input };
  if (input.email !== undefined)
    normalized.email = normalizeEmail(input.email) ?? "";
  if (input.phone !== undefined)
    normalized.phone = normalizePhone(input.phone) ?? "";
  const contact = await updateContactRecord(contactId, normalized);
  if (!contact) throw ApiError.notFound("Contact not found");
  return contact;
}

export function deleteContact(contactId: string) {
  return deleteContactRecord(contactId);
}
