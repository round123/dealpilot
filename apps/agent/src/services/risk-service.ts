import type { RiskCreate, RiskListQuery, RiskUpdate } from "@dealpilot/shared";
import { ApiError } from "../errors/api-error";
import {
  findProject,
  deleteRiskRecord,
  insertRisk,
  listRiskRecords,
  updateRiskRecord,
} from "../repositories/pipeline-repository";
import { toCursorPage } from "./pagination";

export async function listRisks(query: RiskListQuery) {
  return toCursorPage(await listRiskRecords(query), query.limit);
}

export async function createRisk(projectId: string, input: RiskCreate) {
  if (!(await findProject(projectId)))
    throw ApiError.notFound("Project not found");
  return insertRisk(projectId, input);
}

export async function updateRisk(riskId: string, input: RiskUpdate) {
  const risk = await updateRiskRecord(riskId, input);
  if (!risk) throw ApiError.notFound("Risk not found");
  return risk;
}

export async function deleteRisk(riskId: string): Promise<void> {
  if (!(await deleteRiskRecord(riskId)))
    throw ApiError.notFound("Risk not found");
}
