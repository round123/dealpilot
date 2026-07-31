import { and, asc, eq, gt, gte, like, lte, sql } from "drizzle-orm";
import type {
  MilestoneCreate,
  MilestoneListQuery,
  MilestoneUpdate,
  ProjectCreate,
  ProjectListQuery,
  ProjectUpdate,
  RiskCreate,
  RiskListQuery,
  RiskUpdate,
} from "@dealpilot/shared";
import { db } from "../db/client";
import {
  local_events,
  milestones,
  projects,
  reminders,
  risks,
} from "../db/schema";

export async function listProjectRecords(query: ProjectListQuery) {
  const conditions = [];
  if (query.customer_id)
    conditions.push(eq(projects.customer_id, query.customer_id));
  if (query.stage) conditions.push(eq(projects.stage, query.stage));
  if (query.grade) conditions.push(eq(projects.grade, query.grade));
  if (query.cursor) {
    const [cursor] = await db
      .select()
      .from(projects)
      .where(eq(projects.id, query.cursor))
      .limit(1);
    if (cursor) {
      conditions.push(
        sql`(${projects.created_at} > ${cursor.created_at} OR (${projects.created_at} = ${cursor.created_at} AND ${projects.id} > ${query.cursor}))`,
      );
    }
  }

  const base = db
    .select()
    .from(projects)
    .orderBy(asc(projects.created_at), asc(projects.id))
    .limit(query.limit + 1);
  return conditions.length > 0 ? base.where(and(...conditions)) : base;
}

export async function findProject(projectId: string) {
  const [project] = await db
    .select()
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);
  return project;
}

export async function getProjectDetailRecord(projectId: string) {
  const project = await findProject(projectId);
  if (!project) return undefined;
  const [projectRisks, projectMilestones, openReminders] = await Promise.all([
    db.select().from(risks).where(eq(risks.project_id, projectId)),
    db.select().from(milestones).where(eq(milestones.project_id, projectId)),
    db
      .select()
      .from(reminders)
      .where(
        and(
          eq(reminders.project_id, projectId),
          sql`${reminders.status} IN ('pending', 'snoozed', 'overdue')`,
        ),
      )
      .orderBy(asc(reminders.due_at)),
  ]);
  return {
    ...project,
    risks: projectRisks,
    milestones: projectMilestones,
    open_reminders: openReminders,
  };
}

export async function insertProject(input: ProjectCreate) {
  const now = new Date().toISOString();
  const [created] = await db
    .insert(projects)
    .values({
      customer_id: input.customer_id,
      name: input.name,
      currency: input.currency,
      amount: input.amount ?? null,
      probability: input.probability ?? null,
      expected_close_date: input.expected_close_date ?? null,
      stage: input.stage,
      grade: input.grade,
      closed_reason: input.closed_reason ?? null,
      created_at: now,
      updated_at: now,
    })
    .returning();
  return created;
}

export async function updateProjectRecord(
  projectId: string,
  input: ProjectUpdate,
) {
  const [updated] = await db
    .update(projects)
    .set({ ...input, updated_at: new Date().toISOString() })
    .where(eq(projects.id, projectId))
    .returning();
  return updated;
}

export async function updateProjectStageRecord(
  projectId: string,
  stage: string,
) {
  return db.transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1);
    if (!current) return undefined;
    const now = new Date().toISOString();
    const [updated] = await tx
      .update(projects)
      .set({ stage: stage as typeof current.stage, updated_at: now })
      .where(eq(projects.id, projectId))
      .returning();
    await tx.insert(local_events).values({
      event_type: "project.stage_changed",
      entity_type: "project",
      entity_id: projectId,
      metadata: JSON.stringify({ from: current.stage, to: stage }),
      occurred_at: now,
    });
    return updated;
  });
}

export async function archiveProjectRecord(projectId: string, reason?: string) {
  const [updated] = await db
    .update(projects)
    .set({
      stage: "archived",
      closed_reason: reason ?? null,
      updated_at: new Date().toISOString(),
    })
    .where(eq(projects.id, projectId))
    .returning();
  return updated;
}

export async function insertRisk(projectId: string, input: RiskCreate) {
  const handled = input.status === "resolved" || input.status === "ignored";
  const createdAt = new Date().toISOString();
  const [created] = await db
    .insert(risks)
    .values({
      project_id: projectId,
      description: input.description,
      severity: input.severity,
      status: input.status,
      handled_at:
        input.handled_at !== undefined
          ? input.handled_at
          : handled
            ? new Date().toISOString()
            : null,
      created_at: createdAt,
    })
    .returning();
  return created;
}

export async function listRiskRecords(query: RiskListQuery) {
  const conditions = [];
  if (query.project_id) conditions.push(eq(risks.project_id, query.project_id));
  if (query.cursor) conditions.push(gt(risks.id, query.cursor));

  const base = db
    .select()
    .from(risks)
    .orderBy(asc(risks.id))
    .limit(query.limit + 1);
  return conditions.length > 0 ? base.where(and(...conditions)) : base;
}

export async function updateRiskRecord(riskId: string, input: RiskUpdate) {
  const handled = input.status === "resolved" || input.status === "ignored";
  const [updated] = await db
    .update(risks)
    .set({
      ...input,
      ...(input.handled_at === undefined && input.status
        ? { handled_at: handled ? new Date().toISOString() : null }
        : {}),
    })
    .where(eq(risks.id, riskId))
    .returning();
  return updated;
}

export async function deleteRiskRecord(riskId: string) {
  const [deleted] = await db
    .delete(risks)
    .where(eq(risks.id, riskId))
    .returning();
  return deleted;
}

export async function insertMilestone(
  projectId: string,
  input: MilestoneCreate,
) {
  const createdAt = new Date().toISOString();
  const [created] = await db
    .insert(milestones)
    .values({
      project_id: projectId,
      name: input.name,
      date: input.date,
      completed: input.completed,
      created_at: createdAt,
    })
    .returning();
  return created;
}

export async function listMilestoneRecords(query: MilestoneListQuery) {
  const conditions = [];
  if (query.project_id) {
    conditions.push(eq(milestones.project_id, query.project_id));
  }
  if (query.cursor) conditions.push(gt(milestones.id, query.cursor));

  const base = db
    .select()
    .from(milestones)
    .orderBy(asc(milestones.id))
    .limit(query.limit + 1);
  return conditions.length > 0 ? base.where(and(...conditions)) : base;
}

export async function updateMilestoneRecord(
  milestoneId: string,
  input: MilestoneUpdate,
) {
  const [updated] = await db
    .update(milestones)
    .set(input)
    .where(eq(milestones.id, milestoneId))
    .returning();
  return updated;
}

export async function deleteMilestoneRecord(milestoneId: string) {
  return db.transaction(async (tx) => {
    const [deleted] = await tx
      .delete(milestones)
      .where(eq(milestones.id, milestoneId))
      .returning();
    if (!deleted) return undefined;

    await tx
      .delete(reminders)
      .where(eq(reminders.resolution, `milestone:${milestoneId}`));
    return deleted;
  });
}

export function findUpcomingMilestones(fromDate: string, toDate: string) {
  return db
    .select({ milestone: milestones, project: projects })
    .from(milestones)
    .innerJoin(projects, eq(milestones.project_id, projects.id))
    .where(
      and(
        eq(milestones.completed, false),
        gte(milestones.date, fromDate),
        lte(milestones.date, toDate),
      ),
    )
    .limit(100);
}

export async function hasMilestoneReminder(
  projectId: string,
  milestoneId: string,
) {
  const [existing] = await db
    .select({ id: reminders.id })
    .from(reminders)
    .where(
      and(
        eq(reminders.project_id, projectId),
        eq(reminders.type, "fixed_time"),
        like(reminders.resolution, `%milestone:${milestoneId}%`),
      ),
    )
    .limit(1);
  return Boolean(existing);
}

export async function insertMilestoneReminder(input: {
  customerId: string;
  projectId: string;
  milestoneId: string;
  dueAt: string;
}) {
  const now = new Date().toISOString();
  await db.insert(reminders).values({
    customer_id: input.customerId,
    project_id: input.projectId,
    type: "fixed_time",
    status: "pending",
    due_at: input.dueAt,
    priority: "normal",
    resolution: `milestone:${input.milestoneId}`,
    created_at: now,
    updated_at: now,
  });
}
