import type {
  ProjectCreate,
  ProjectListQuery,
  ProjectStageUpdate,
  ProjectUpdate,
} from "@dealpilot/shared";
import { ApiError } from "../errors/api-error";
import {
  archiveProjectRecord,
  getProjectDetailRecord,
  insertProject,
  listProjectRecords,
  updateProjectRecord,
  updateProjectStageRecord,
} from "../repositories/pipeline-repository";
import { toCursorPage } from "./pagination";
import { sortRisksByPriority } from "./risk-priority";

export async function listProjects(query: ProjectListQuery) {
  return toCursorPage(await listProjectRecords(query), query.limit);
}

export function createProject(input: ProjectCreate) {
  return insertProject(input);
}

export async function getProject(projectId: string) {
  const project = await getProjectDetailRecord(projectId);
  if (!project) throw ApiError.notFound("Project not found");
  return { ...project, risks: sortRisksByPriority(project.risks) };
}

export async function updateProject(projectId: string, input: ProjectUpdate) {
  const project = await updateProjectRecord(projectId, input);
  if (!project) throw ApiError.notFound("Project not found");
  return project;
}

export async function updateProjectStage(projectId: string, input: ProjectStageUpdate) {
  const project = await updateProjectStageRecord(projectId, input.stage);
  if (!project) throw ApiError.notFound("Project not found");
  return project;
}

export async function archiveProject(projectId: string, reason?: string) {
  if (!await archiveProjectRecord(projectId, reason)) {
    throw ApiError.notFound("Project not found");
  }
}
