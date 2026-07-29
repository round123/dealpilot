import type { FollowUpCreate, FollowUpListQuery, FollowUpUpdate } from "@dealpilot/shared";
import { ApiError } from "../errors/api-error";
import {
  deleteFollowUpRecord,
  insertFollowUp,
  listFollowUps as listFollowUpRecords,
  updateFollowUpRecord,
} from "../repositories/crm-repository";
import { toCursorPage } from "./pagination";

export async function listFollowUps(query: FollowUpListQuery) {
  return toCursorPage(await listFollowUpRecords(query), query.limit);
}

export function createFollowUp(input: FollowUpCreate) {
  return insertFollowUp(input);
}

export async function updateFollowUp(followUpId: string, input: FollowUpUpdate) {
  const followUp = await updateFollowUpRecord(followUpId, input);
  if (!followUp) throw ApiError.notFound("Follow-up not found");
  return followUp;
}

export function deleteFollowUp(followUpId: string) {
  return deleteFollowUpRecord(followUpId);
}
