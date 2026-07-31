import {
  CustomerContactSchema,
  CustomerDealSchema,
  CustomerDetailSchema as CloudCustomerDetailSchema,
  CustomerFollowUpSchema,
  CustomerReminderSchema,
  CustomerSocialAccountSchema,
  CustomerSummarySchema,
  DealMilestoneSchema as CloudDealMilestoneSchema,
  DealRiskSchema as CloudDealRiskSchema,
  type CustomerDetail as CloudCustomerDetail,
  type CustomerSummary,
} from "@dealpilot/api-client";
import type {
  Contact,
  Customer,
  CustomerDetail,
  FollowUp,
  Milestone,
  Project,
  ProjectDetail,
  Reminder,
  Risk,
  SocialAccount,
} from "@dealpilot/shared";

export const LOCAL_AGENT_USER_ID =
  "11111111-1111-4111-8111-111111111111";

const EPOCH = new Date(0).toISOString();

export function mapCustomer(customer: Customer): CustomerSummary {
  return CustomerSummarySchema.parse({
    id: customer.id,
    owner_user_id: LOCAL_AGENT_USER_ID,
    name: customer.name,
    company: customer.company,
    sector: null,
    size: null,
    linkedin_url: null,
    website: null,
    phone_number: null,
    address: null,
    zipcode: null,
    city: null,
    state_abbr: null,
    description: null,
    revenue: null,
    tax_identifier: null,
    logo: { src: "", title: customer.name },
    context_links: [],
    country: customer.country,
    source: customer.source,
    grade: customer.grade,
    status: customer.status,
    deleted_at: customer.deleted_at,
    created_at: customer.created_at,
    updated_at: customer.updated_at,
    sales_id: LOCAL_AGENT_USER_ID,
    nb_contacts: 0,
    nb_deals: 0,
    search_text: [
      customer.name,
      customer.company,
      customer.country,
      customer.source,
    ]
      .filter(Boolean)
      .join(" "),
  });
}

export function mapCustomerDetail(customer: CustomerDetail): CloudCustomerDetail {
  const summary = mapCustomer(customer);
  const fallbackTimestamp = customer.updated_at || customer.created_at;
  return CloudCustomerDetailSchema.parse({
    ...withoutSummaryFields(summary),
    contacts: (customer.contacts ?? []).map((contact) =>
      mapCustomerContact(contact, customer.id, fallbackTimestamp),
    ),
    social_accounts: (customer.social_accounts ?? []).map((account) =>
      mapCustomerSocialAccount(account, customer.id, fallbackTimestamp),
    ),
    deals: (customer.projects ?? []).map((project) =>
      mapCustomerDeal(project, customer.id, fallbackTimestamp),
    ),
    recent_follow_ups: (customer.recent_follow_ups ?? []).map((followUp) =>
      mapCustomerFollowUp(followUp, customer.id, fallbackTimestamp),
    ),
    open_reminders: (customer.open_reminders ?? []).map((reminder) =>
      mapCustomerReminder(reminder, customer.id, fallbackTimestamp),
    ),
  });
}

export function mapContact(contact: Contact) {
  const name = contact.name.trim();
  const [firstName, ...lastNameParts] = name.split(/\s+/);
  return {
    ...mapCustomerContact(contact, contact.customer_id, contact.created_at),
    sales_id: LOCAL_AGENT_USER_ID,
    first_name: firstName || name,
    last_name: lastNameParts.join(" "),
    tags: [],
    nb_tasks: 0,
  };
}

export function mapSocialAccount(account: SocialAccount) {
  return {
    ...mapCustomerSocialAccount(
      account,
      account.customer_id,
      account.created_at,
    ),
    sales_id: LOCAL_AGENT_USER_ID,
  };
}

export function mapProject(project: Project) {
  const deal = mapCustomerDeal(
    project,
    project.customer_id,
    project.updated_at,
  );
  return {
    ...deal,
    sales_id: LOCAL_AGENT_USER_ID,
    contact_ids: [],
    index: deal.sort_index ?? 0,
  };
}

export function mapFollowUp(followUp: FollowUp) {
  return mapCustomerFollowUp(
    followUp,
    followUp.customer_id,
    followUp.created_at,
  );
}

export function mapReminder(reminder: Reminder) {
  return mapCustomerReminder(
    reminder,
    reminder.customer_id,
    reminder.updated_at,
  );
}

export function mapRisk(risk: Risk, fallbackTimestamp = risk.created_at) {
  return CloudDealRiskSchema.parse({
    id: risk.id,
    owner_user_id: LOCAL_AGENT_USER_ID,
    deal_id: risk.project_id,
    description: risk.description,
    severity: risk.severity,
    status: risk.status,
    handled_at: risk.handled_at,
    created_at: risk.created_at,
    updated_at: fallbackTimestamp,
  });
}

export function mapMilestone(
  milestone: Milestone,
  fallbackTimestamp = milestone.created_at,
) {
  return CloudDealMilestoneSchema.parse({
    id: milestone.id,
    owner_user_id: LOCAL_AGENT_USER_ID,
    deal_id: milestone.project_id,
    name: milestone.name,
    due_date: milestone.date,
    completed: milestone.completed,
    created_at: milestone.created_at,
    updated_at: fallbackTimestamp,
  });
}

export function mapProjectRisks(project: ProjectDetail) {
  return (project.risks ?? []).map((risk) => mapRisk(risk));
}

export function mapProjectMilestones(project: ProjectDetail) {
  return (project.milestones ?? []).map((milestone) =>
    mapMilestone(milestone),
  );
}

function mapCustomerContact(
  contact: Contact | NonNullable<CustomerDetail["contacts"]>[number],
  companyId: string,
  fallbackCreatedAt: string,
) {
  const createdAt = "created_at" in contact ? contact.created_at : fallbackCreatedAt;
  const name = contact.name;
  const email = contact.email ?? null;
  const phone = contact.phone ?? null;
  return CustomerContactSchema.parse({
    id: contact.id,
    owner_user_id: LOCAL_AGENT_USER_ID,
    company_id: companyId,
    first_name: name,
    last_name: "",
    name,
    gender: null,
    title: contact.title,
    background: null,
    avatar: null,
    first_seen: createdAt,
    last_seen: createdAt,
    has_newsletter: false,
    status: null,
    linkedin_url: null,
    email_jsonb: email ? [{ email, type: "Work" }] : [],
    phone_jsonb: phone ? [{ number: phone, type: "Work" }] : [],
    created_at: createdAt,
    updated_at: createdAt,
  });
}

function mapCustomerSocialAccount(
  account:
    | SocialAccount
    | NonNullable<CustomerDetail["social_accounts"]>[number],
  companyId: string,
  fallbackCreatedAt: string,
) {
  const fullAccount = "customer_id" in account;
  const createdAt = fullAccount ? account.created_at : fallbackCreatedAt;
  return CustomerSocialAccountSchema.parse({
    id: account.id,
    owner_user_id: LOCAL_AGENT_USER_ID,
    company_id: companyId,
    contact_id: fullAccount ? account.contact_id : null,
    platform: account.platform,
    raw_identifier: account.raw_identifier,
    normalized_identifier: fullAccount
      ? account.normalized_identifier
      : account.raw_identifier.trim().toLocaleLowerCase(),
    manually_bound: fullAccount ? account.manually_bound : false,
    created_at: createdAt,
    updated_at: createdAt,
  });
}

function mapCustomerDeal(
  project: Project | NonNullable<CustomerDetail["projects"]>[number],
  companyId: string,
  fallbackTimestamp: string,
) {
  const fullProject = "customer_id" in project;
  const createdAt = fullProject ? project.created_at : fallbackTimestamp;
  const updatedAt = fullProject ? project.updated_at : fallbackTimestamp;
  const stage = normalizeStage(project.stage);
  return CustomerDealSchema.parse({
    id: project.id,
    owner_user_id: LOCAL_AGENT_USER_ID,
    company_id: companyId,
    name: project.name,
    category: null,
    stage,
    grade: fullProject ? project.grade : "B",
    description: null,
    currency: fullProject ? project.currency : "USD",
    amount: project.amount,
    probability: fullProject ? project.probability : null,
    expected_closing_date: fullProject ? project.expected_close_date : null,
    closed_reason: fullProject ? project.closed_reason : null,
    archived_at: stage === "archived" ? updatedAt : null,
    sort_index: null,
    created_at: createdAt,
    updated_at: updatedAt,
  });
}

function mapCustomerFollowUp(
  followUp: FollowUp | NonNullable<CustomerDetail["recent_follow_ups"]>[number],
  companyId: string,
  fallbackTimestamp: string,
) {
  const fullFollowUp = "customer_id" in followUp;
  const createdAt = fullFollowUp ? followUp.created_at : followUp.occurred_at;
  return CustomerFollowUpSchema.parse({
    id: followUp.id,
    owner_user_id: LOCAL_AGENT_USER_ID,
    company_id: companyId,
    deal_id: fullFollowUp ? followUp.project_id : null,
    type: followUp.type,
    note: followUp.note,
    message_body: fullFollowUp ? followUp.message_body : null,
    message_direction: fullFollowUp ? followUp.message_direction : null,
    occurred_at: followUp.occurred_at,
    created_at: createdAt || fallbackTimestamp,
    updated_at: createdAt || fallbackTimestamp,
  });
}

function mapCustomerReminder(
  reminder: Reminder | NonNullable<CustomerDetail["open_reminders"]>[number],
  companyId: string,
  fallbackTimestamp: string,
) {
  const fullReminder = "customer_id" in reminder;
  const createdAt = fullReminder ? reminder.created_at : fallbackTimestamp;
  return CustomerReminderSchema.parse({
    id: reminder.id,
    owner_user_id: LOCAL_AGENT_USER_ID,
    company_id: companyId,
    deal_id: fullReminder ? reminder.project_id : null,
    type: reminder.type,
    status: reminder.status,
    due_at: reminder.due_at,
    priority: fullReminder ? reminder.priority : "normal",
    last_notified_at: fullReminder ? reminder.last_notified_at : null,
    snooze_until: fullReminder ? reminder.snooze_until : null,
    resolution: fullReminder ? reminder.resolution : null,
    deletion_event_id: null,
    created_at: createdAt || EPOCH,
    updated_at: fullReminder ? reminder.updated_at : createdAt || EPOCH,
  });
}

function normalizeStage(stage: string) {
  const aliases: Record<string, string> = {
    opportunity: "lead",
    "proposal-sent": "qualified",
    "in-negociation": "negotiation",
    "in-negotiation": "negotiation",
    won: "closed_won",
    lost: "closed_lost",
    delayed: "negotiation",
  };
  return aliases[stage] ?? stage;
}

function withoutSummaryFields(summary: CustomerSummary) {
  const { sales_id: _salesId, nb_contacts: _contacts, nb_deals: _deals, search_text: _search, ...customer } = summary;
  return customer;
}
