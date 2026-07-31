import { MILESTONE_REMINDER_DAYS_BEFORE } from "@dealpilot/shared";
import type {
  MilestoneCreate,
  MilestoneListQuery,
  MilestoneUpdate,
} from "@dealpilot/shared";
import { ApiError } from "../errors/api-error";
import {
  findProject,
  deleteMilestoneRecord,
  findUpcomingMilestones,
  hasMilestoneReminder,
  insertMilestone,
  insertMilestoneReminder,
  listMilestoneRecords,
  updateMilestoneRecord,
} from "../repositories/pipeline-repository";
import { toCursorPage } from "./pagination";

export async function listMilestones(query: MilestoneListQuery) {
  return toCursorPage(await listMilestoneRecords(query), query.limit);
}

export async function createMilestone(
  projectId: string,
  input: MilestoneCreate,
) {
  if (!(await findProject(projectId)))
    throw ApiError.notFound("Project not found");
  return insertMilestone(projectId, input);
}

export async function updateMilestone(
  milestoneId: string,
  input: MilestoneUpdate,
) {
  const milestone = await updateMilestoneRecord(milestoneId, input);
  if (!milestone) throw ApiError.notFound("Milestone not found");
  return milestone;
}

export async function deleteMilestone(milestoneId: string): Promise<void> {
  if (!(await deleteMilestoneRecord(milestoneId))) {
    throw ApiError.notFound("Milestone not found");
  }
}

export async function runMilestoneReminderSweep(now: Date = new Date()) {
  const fromDate = now.toISOString().split("T")[0];
  const toDate = new Date(
    now.getTime() + MILESTONE_REMINDER_DAYS_BEFORE * 24 * 60 * 60 * 1000,
  )
    .toISOString()
    .split("T")[0];
  const upcoming = await findUpcomingMilestones(fromDate, toDate);
  let created = 0;

  for (const { milestone, project } of upcoming) {
    if (await hasMilestoneReminder(project.id, milestone.id)) continue;
    await insertMilestoneReminder({
      customerId: project.customer_id,
      projectId: project.id,
      milestoneId: milestone.id,
      dueAt: milestone.date,
    });
    created++;
  }
  return created;
}
