const OWNER_ID = "90000000-0000-4000-8000-000000000001";

export const CUSTOMER_BEHAVIOR_IDS = {
  owner: OWNER_ID,
  alpha: "a1000000-0000-4000-8000-000000000001",
  beta: "a1000000-0000-4000-8000-000000000002",
  gamma: "a1000000-0000-4000-8000-000000000003",
  deleted: "a1000000-0000-4000-8000-000000000004",
  mergeSource: "a1000000-0000-4000-8000-000000000005",
  mergeTarget: "a1000000-0000-4000-8000-000000000006",
  contact: "c1000000-0000-4000-8000-000000000001",
  social: "d1000000-0000-4000-8000-000000000001",
  deal: "e1000000-0000-4000-8000-000000000001",
  reminderPending: "11000000-0000-4000-8000-000000000001",
  reminderSnoozed: "11000000-0000-4000-8000-000000000002",
  reminderOverdue: "11000000-0000-4000-8000-000000000003",
  reminderCompleted: "11000000-0000-4000-8000-000000000004",
  reminderOverridden: "11000000-0000-4000-8000-000000000005",
  deletionEvent: "71000000-0000-4000-8000-000000000001",
} as const;

export const CUSTOMER_BEHAVIOR_TIMES = {
  created1: "2026-07-01T08:00:00.000Z",
  created2: "2026-07-02T08:00:00.000Z",
  created3: "2026-07-03T08:00:00.000Z",
  created4: "2026-07-04T08:00:00.000Z",
  created5: "2026-07-05T08:00:00.000Z",
  deleted: "2026-07-30T09:00:00.000Z",
  restored: "2026-07-30T10:00:00.000Z",
} as const;

type CustomerFixtureInput = {
  id: string;
  name: string;
  company: string | null;
  country: string | null;
  source: string | null;
  grade: "A" | "B" | "C";
  status: "active" | "inactive";
  created_at: string;
  deleted_at?: string | null;
};

const customerRow = (input: CustomerFixtureInput) => ({
  id: input.id,
  owner_user_id: OWNER_ID,
  name: input.name,
  company: input.company,
  sector: null,
  size: null,
  linkedin_url: null,
  website: null,
  phone_number: null,
  address: null,
  zipcode: null,
  city: null,
  state_abbr: null,
  country: input.country,
  description: null,
  revenue: null,
  tax_identifier: null,
  logo: null,
  context_links: [],
  source: input.source,
  grade: input.grade,
  status: input.status,
  deleted_at: input.deleted_at ?? null,
  created_at: input.created_at,
  updated_at: input.created_at,
});

const customers = [
  customerRow({
    id: CUSTOMER_BEHAVIOR_IDS.alpha,
    name: "Acme North",
    company: "Northstar Trading",
    country: "CN",
    source: "conference",
    grade: "A",
    status: "active",
    created_at: CUSTOMER_BEHAVIOR_TIMES.created1,
  }),
  customerRow({
    id: CUSTOMER_BEHAVIOR_IDS.beta,
    name: "Beacon Retail",
    company: "Acme Labs",
    country: "SG",
    source: "referral",
    grade: "B",
    status: "inactive",
    created_at: CUSTOMER_BEHAVIOR_TIMES.created2,
  }),
  customerRow({
    id: CUSTOMER_BEHAVIOR_IDS.gamma,
    name: "Cedar Systems",
    company: null,
    country: "Acme Islands",
    source: null,
    grade: "C",
    status: "active",
    created_at: CUSTOMER_BEHAVIOR_TIMES.created2,
  }),
  customerRow({
    id: CUSTOMER_BEHAVIOR_IDS.deleted,
    name: "Deleted Acme",
    company: "Archive Ltd",
    country: "CN",
    source: "legacy",
    grade: "A",
    status: "active",
    created_at: CUSTOMER_BEHAVIOR_TIMES.created3,
    deleted_at: CUSTOMER_BEHAVIOR_TIMES.deleted,
  }),
  customerRow({
    id: CUSTOMER_BEHAVIOR_IDS.mergeSource,
    name: "Merge Source",
    company: null,
    country: "DE",
    source: null,
    grade: "A",
    status: "inactive",
    created_at: CUSTOMER_BEHAVIOR_TIMES.created4,
  }),
  customerRow({
    id: CUSTOMER_BEHAVIOR_IDS.mergeTarget,
    name: "Merge Target",
    company: "Target Holdings",
    country: "US",
    source: "partner",
    grade: "C",
    status: "active",
    created_at: CUSTOMER_BEHAVIOR_TIMES.created5,
  }),
] as const;

const contact = {
  id: CUSTOMER_BEHAVIOR_IDS.contact,
  owner_user_id: OWNER_ID,
  company_id: CUSTOMER_BEHAVIOR_IDS.alpha,
  first_name: "Ada",
  last_name: "Lovelace",
  name: "Ada Lovelace",
  gender: null,
  title: "CTO",
  background: null,
  avatar: null,
  first_seen: CUSTOMER_BEHAVIOR_TIMES.created1,
  last_seen: CUSTOMER_BEHAVIOR_TIMES.created5,
  has_newsletter: false,
  status: null,
  linkedin_url: null,
  email_jsonb: [{ email: "ada@example.com", type: "Work" }],
  phone_jsonb: [{ number: "+8613800000000", type: "Work" }],
  created_at: CUSTOMER_BEHAVIOR_TIMES.created1,
  updated_at: CUSTOMER_BEHAVIOR_TIMES.created5,
} as const;

const socialAccount = {
  id: CUSTOMER_BEHAVIOR_IDS.social,
  owner_user_id: OWNER_ID,
  company_id: CUSTOMER_BEHAVIOR_IDS.alpha,
  contact_id: CUSTOMER_BEHAVIOR_IDS.contact,
  platform: "linkedin",
  raw_identifier: "ada-lovelace",
  normalized_identifier: "ada-lovelace",
  manually_bound: true,
  created_at: CUSTOMER_BEHAVIOR_TIMES.created1,
  updated_at: CUSTOMER_BEHAVIOR_TIMES.created1,
} as const;

const deal = {
  id: CUSTOMER_BEHAVIOR_IDS.deal,
  owner_user_id: OWNER_ID,
  company_id: CUSTOMER_BEHAVIOR_IDS.alpha,
  name: "Cloud migration",
  category: null,
  stage: "proposal",
  grade: "A",
  description: null,
  currency: "USD",
  amount: 12500,
  probability: 60,
  expected_closing_date: "2026-09-30",
  closed_reason: null,
  archived_at: null,
  sort_index: 1,
  created_at: CUSTOMER_BEHAVIOR_TIMES.created2,
  updated_at: CUSTOMER_BEHAVIOR_TIMES.created5,
} as const;

const followUps = Array.from({ length: 11 }, (_, index) => {
  const sequence = index + 1;
  const idSuffix = String(sequence).padStart(12, "0");
  const day = String(20 - index).padStart(2, "0");
  return {
    id: `f1000000-0000-4000-8000-${idSuffix}`,
    owner_user_id: OWNER_ID,
    company_id: CUSTOMER_BEHAVIOR_IDS.alpha,
    deal_id: CUSTOMER_BEHAVIOR_IDS.deal,
    type: "note" as const,
    note: `Follow-up ${sequence}`,
    message_body: null,
    message_direction: null,
    occurred_at: `2026-07-${day}T08:00:00.000Z`,
    created_at: `2026-07-${day}T08:00:00.000Z`,
    updated_at: `2026-07-${day}T08:00:00.000Z`,
  };
});

const reminderBase = (
  id: string,
  status: "pending" | "completed" | "snoozed" | "overdue",
  dueAt: string,
  resolution: string | null,
) => ({
  id,
  owner_user_id: OWNER_ID,
  company_id: CUSTOMER_BEHAVIOR_IDS.alpha,
  deal_id: CUSTOMER_BEHAVIOR_IDS.deal,
  type: "fixed_time" as const,
  status,
  due_at: dueAt,
  priority: "normal" as const,
  last_notified_at: null,
  snooze_until: null,
  resolution,
  deletion_event_id: null,
  created_at: CUSTOMER_BEHAVIOR_TIMES.created1,
  updated_at: CUSTOMER_BEHAVIOR_TIMES.created1,
});

const reminders = [
  reminderBase(
    CUSTOMER_BEHAVIOR_IDS.reminderPending,
    "pending",
    "2026-08-01T08:00:00.000Z",
    "Original pending note",
  ),
  reminderBase(
    CUSTOMER_BEHAVIOR_IDS.reminderSnoozed,
    "snoozed",
    "2026-08-02T08:00:00.000Z",
    null,
  ),
  reminderBase(
    CUSTOMER_BEHAVIOR_IDS.reminderOverdue,
    "overdue",
    "2026-08-03T08:00:00.000Z",
    "Original overdue note",
  ),
  reminderBase(
    CUSTOMER_BEHAVIOR_IDS.reminderCompleted,
    "completed",
    "2026-07-01T08:00:00.000Z",
    "Already done",
  ),
  reminderBase(
    CUSTOMER_BEHAVIOR_IDS.reminderOverridden,
    "pending",
    "2026-08-04T08:00:00.000Z",
    null,
  ),
] as const;

const detailFollowUps = [
  followUps[0],
  followUps[1],
  followUps[2],
  followUps[3],
  followUps[4],
  followUps[5],
  followUps[6],
  followUps[7],
  followUps[8],
  followUps[9],
] as const;

const detailOpenReminders = [reminders[0], reminders[1], reminders[2]] as const;

const reminderState = <Status extends string>(
  id: string,
  status: Status,
  resolution: string | null,
  deletionEventId: string | null = null,
) => ({
  id,
  status,
  resolution,
  deletion_event_id: deletionEventId,
});

const alpha = customers[0];
const mergeSource = customers[4];
const mergeTarget = customers[5];

export const CUSTOMER_BEHAVIOR_FIXTURE = {
  seed: {
    customers,
    contacts: [contact],
    socialAccounts: [socialAccount],
    deals: [deal],
    followUps,
    reminders,
  },
  v1DetailResponse: {
    ...alpha,
    contacts: [
      {
        id: contact.id,
        name: contact.name,
        title: contact.title,
        email: contact.email_jsonb[0].email,
        phone: contact.phone_jsonb[0].number,
      },
    ],
    social_accounts: [
      {
        id: socialAccount.id,
        platform: socialAccount.platform,
        raw_identifier: socialAccount.raw_identifier,
      },
    ],
    projects: [
      {
        id: deal.id,
        name: deal.name,
        stage: deal.stage,
        amount: deal.amount,
      },
    ],
    recent_follow_ups: detailFollowUps.map((item) => ({
      id: item.id,
      type: item.type,
      note: item.note,
      occurred_at: item.occurred_at,
    })),
    open_reminders: detailOpenReminders.map((item) => ({
      id: item.id,
      type: item.type,
      status: item.status,
      due_at: item.due_at,
    })),
  },
  v2DetailResponse: {
    ...alpha,
    contacts: [contact],
    social_accounts: [socialAccount],
    deals: [deal],
    recent_follow_ups: detailFollowUps,
    open_reminders: detailOpenReminders,
  },
  create: {
    input: { name: "Created with defaults", company: "New Co" },
    expectedDefaults: { grade: "B", status: "active" },
    expectedCustomer: customerRow({
      id: "a1000000-0000-4000-8000-000000000007",
      name: "Created with defaults",
      company: "New Co",
      country: null,
      source: null,
      grade: "B",
      status: "active",
      created_at: CUSTOMER_BEHAVIOR_TIMES.created5,
    }),
  },
  update: {
    customerId: CUSTOMER_BEHAVIOR_IDS.beta,
    input: {
      name: "Beacon Global",
      company: "Beacon Holdings",
      country: "JP",
      source: "expo",
      grade: "A",
      status: "active",
    },
    expectedFields: {
      name: "Beacon Global",
      company: "Beacon Holdings",
      country: "JP",
      source: "expo",
      grade: "A",
      status: "active",
    },
  },
  list: {
    defaultQuery: { limit: 2, sort: "created_at" },
    orderedIds: [
      CUSTOMER_BEHAVIOR_IDS.alpha,
      CUSTOMER_BEHAVIOR_IDS.beta,
      CUSTOMER_BEHAVIOR_IDS.gamma,
      CUSTOMER_BEHAVIOR_IDS.mergeSource,
      CUSTOMER_BEHAVIOR_IDS.mergeTarget,
    ],
    pages: [
      [CUSTOMER_BEHAVIOR_IDS.alpha, CUSTOMER_BEHAVIOR_IDS.beta],
      [CUSTOMER_BEHAVIOR_IDS.gamma, CUSTOMER_BEHAVIOR_IDS.mergeSource],
      [CUSTOMER_BEHAVIOR_IDS.mergeTarget],
    ],
    searches: [
      {
        query: { search: "Acme", limit: 20, sort: "created_at" },
        expectedIds: [
          CUSTOMER_BEHAVIOR_IDS.alpha,
          CUSTOMER_BEHAVIOR_IDS.beta,
          CUSTOMER_BEHAVIOR_IDS.gamma,
        ],
      },
      {
        query: { search: "Northstar", limit: 20, sort: "name" },
        expectedIds: [CUSTOMER_BEHAVIOR_IDS.alpha],
      },
      {
        query: { search: "Acme Islands", limit: 20, sort: "name" },
        expectedIds: [CUSTOMER_BEHAVIOR_IDS.gamma],
      },
    ],
    filter: {
      query: { grade: "A", status: "active", limit: 20, sort: "name" },
      expectedIds: [CUSTOMER_BEHAVIOR_IDS.alpha],
    },
  },
  detail: {
    customerId: CUSTOMER_BEHAVIOR_IDS.alpha,
    expected: {
      contactIds: [CUSTOMER_BEHAVIOR_IDS.contact],
      socialAccountIds: [CUSTOMER_BEHAVIOR_IDS.social],
      projectOrDealIds: [CUSTOMER_BEHAVIOR_IDS.deal],
      recentFollowUpIds: [
        "f1000000-0000-4000-8000-000000000001",
        "f1000000-0000-4000-8000-000000000002",
        "f1000000-0000-4000-8000-000000000003",
        "f1000000-0000-4000-8000-000000000004",
        "f1000000-0000-4000-8000-000000000005",
        "f1000000-0000-4000-8000-000000000006",
        "f1000000-0000-4000-8000-000000000007",
        "f1000000-0000-4000-8000-000000000008",
        "f1000000-0000-4000-8000-000000000009",
        "f1000000-0000-4000-8000-000000000010",
      ],
      openReminderIds: [
        CUSTOMER_BEHAVIOR_IDS.reminderPending,
        CUSTOMER_BEHAVIOR_IDS.reminderSnoozed,
        CUSTOMER_BEHAVIOR_IDS.reminderOverdue,
      ],
    },
  },
  deleteRestore: {
    customerId: CUSTOMER_BEHAVIOR_IDS.alpha,
    deletedAt: CUSTOMER_BEHAVIOR_TIMES.deleted,
    reminderStates: {
      before: [
        reminderState(
          CUSTOMER_BEHAVIOR_IDS.reminderPending,
          "pending",
          "Original pending note",
        ),
        reminderState(CUSTOMER_BEHAVIOR_IDS.reminderSnoozed, "snoozed", null),
        reminderState(
          CUSTOMER_BEHAVIOR_IDS.reminderOverdue,
          "overdue",
          "Original overdue note",
        ),
        reminderState(
          CUSTOMER_BEHAVIOR_IDS.reminderCompleted,
          "completed",
          "Already done",
        ),
        reminderState(
          CUSTOMER_BEHAVIOR_IDS.reminderOverridden,
          "pending",
          null,
        ),
      ],
      afterDelete: [
        reminderState(
          CUSTOMER_BEHAVIOR_IDS.reminderPending,
          "ignored",
          "Customer deleted",
          CUSTOMER_BEHAVIOR_IDS.deletionEvent,
        ),
        reminderState(
          CUSTOMER_BEHAVIOR_IDS.reminderSnoozed,
          "ignored",
          "Customer deleted",
          CUSTOMER_BEHAVIOR_IDS.deletionEvent,
        ),
        reminderState(
          CUSTOMER_BEHAVIOR_IDS.reminderOverdue,
          "ignored",
          "Customer deleted",
          CUSTOMER_BEHAVIOR_IDS.deletionEvent,
        ),
        reminderState(
          CUSTOMER_BEHAVIOR_IDS.reminderCompleted,
          "completed",
          "Already done",
        ),
        reminderState(
          CUSTOMER_BEHAVIOR_IDS.reminderOverridden,
          "ignored",
          "Customer deleted",
          CUSTOMER_BEHAVIOR_IDS.deletionEvent,
        ),
      ],
      afterExternalOverride: [
        reminderState(
          CUSTOMER_BEHAVIOR_IDS.reminderPending,
          "ignored",
          "Customer deleted",
          CUSTOMER_BEHAVIOR_IDS.deletionEvent,
        ),
        reminderState(
          CUSTOMER_BEHAVIOR_IDS.reminderSnoozed,
          "ignored",
          "Customer deleted",
          CUSTOMER_BEHAVIOR_IDS.deletionEvent,
        ),
        reminderState(
          CUSTOMER_BEHAVIOR_IDS.reminderOverdue,
          "ignored",
          "Customer deleted",
          CUSTOMER_BEHAVIOR_IDS.deletionEvent,
        ),
        reminderState(
          CUSTOMER_BEHAVIOR_IDS.reminderCompleted,
          "completed",
          "Already done",
        ),
        reminderState(
          CUSTOMER_BEHAVIOR_IDS.reminderOverridden,
          "completed",
          "Handled elsewhere",
        ),
      ],
      afterRestore: [
        reminderState(
          CUSTOMER_BEHAVIOR_IDS.reminderPending,
          "pending",
          "Original pending note",
        ),
        reminderState(CUSTOMER_BEHAVIOR_IDS.reminderSnoozed, "snoozed", null),
        reminderState(
          CUSTOMER_BEHAVIOR_IDS.reminderOverdue,
          "overdue",
          "Original overdue note",
        ),
        reminderState(
          CUSTOMER_BEHAVIOR_IDS.reminderCompleted,
          "completed",
          "Already done",
        ),
        reminderState(
          CUSTOMER_BEHAVIOR_IDS.reminderOverridden,
          "completed",
          "Handled elsewhere",
        ),
      ],
    },
  },
  merge: {
    sourceCustomer: mergeSource,
    targetCustomer: mergeTarget,
    choices: {
      name: "source",
      company: "target",
      country: "source",
      source: "target",
      grade: "source",
      status: "target",
    },
    expectedFields: {
      name: "Merge Source",
      company: "Target Holdings",
      country: "DE",
      source: "partner",
      grade: "A",
      status: "active",
    },
    expectedSourceDeleted: true,
    expectedChildOwner: CUSTOMER_BEHAVIOR_IDS.mergeTarget,
    expectedMovedCounts: {
      contacts: 1,
      social_accounts: 1,
      projects_or_deals: 1,
      follow_ups: 1,
      reminders: 1,
    },
  },
} as const;
