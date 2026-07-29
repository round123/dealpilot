import type { RiskCreate, RiskUpdate } from "@dealpilot/shared";
import { ApiError } from "../errors/api-error";
import {
  findProject,
  insertRisk,
  updateRiskRecord,
} from "../repositories/pipeline-repository";

export async function createRisk(projectId: string, input: RiskCreate) {
  if (!await findProject(projectId)) throw ApiError.notFound("Project not found");
  return insertRisk(projectId, input);
}

export async function updateRisk(riskId: string, input: RiskUpdate) {
  const risk = await updateRiskRecord(riskId, input);
  if (!risk) throw ApiError.notFound("Risk not found");
  return risk;
}
