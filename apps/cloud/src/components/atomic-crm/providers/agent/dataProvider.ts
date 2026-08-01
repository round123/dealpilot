import { API_ERROR_CODES, ApiError } from "@dealpilot/api-client";
import {
  ContactSchema,
  CustomerDetailSchema,
  CustomerSchema,
  FollowUpSchema,
  MilestoneSchema,
  ProjectDetailSchema,
  ProjectSchema,
  ReminderSchema,
  RiskSchema,
  SocialAccountSchema,
  type ProjectDetail,
} from "@dealpilot/shared";
import type {
  CreateParams,
  DataProvider,
  DeleteManyParams,
  DeleteParams,
  GetListParams,
  GetManyParams,
  GetManyReferenceParams,
  GetOneParams,
  Identifier,
  RaRecord,
  UpdateManyParams,
  UpdateParams,
} from "ra-core";

import type { ConfigurationContextValue } from "../../root/ConfigurationContext";
import { defaultConfiguration } from "../../root/defaultConfiguration";
import type { Deal } from "../../types";
import type { CrmDataProvider } from "../types";
import { AGENT_CRM_CAPABILITIES } from "../capabilities";
import { agentVoidParser, createAgentClient, type AgentClient } from "./client";
import {
  LOCAL_AGENT_USER_ID,
  mapContact,
  mapCustomer,
  mapFollowUp,
  mapMilestone,
  mapProject,
  mapReminder,
  mapRisk,
  mapSocialAccount,
} from "./mappers";

const AGENT_CONFIGURATION_STORAGE_KEY = "dealpilot.agent-configuration";
const EMPTY_RESOURCES = new Set([
  "activity_log",
  "contact_notes",
  "deal_notes",
  "tags",
  "tasks",
]);

interface Parser<T> {
  parse(value: unknown): T;
}

interface CursorPage<T> {
  items: T[];
  next_cursor: string | null;
}

export interface CreateAgentDataProviderOptions {
  client?: AgentClient;
  configurationStorage?: Pick<Storage, "getItem" | "setItem">;
}

export function createAgentDataProvider({
  client = createAgentClient(),
  configurationStorage = window.localStorage,
}: CreateAgentDataProviderOptions = {}): CrmDataProvider {
  const projectDetailCache = new Map<string, ProjectDetail>();

  const fetchCursorPages = async <T>(
    path: string,
    parser: Parser<T>,
    query: Record<string, string | number | undefined> = {},
    signal?: AbortSignal,
  ): Promise<T[]> => {
    const result: T[] = [];
    let cursor: string | undefined;
    do {
      const page = await client.get(path, cursorPageParser(parser), {
        query: { ...query, cursor, limit: 100 },
        signal,
      });
      result.push(...page.items);
      cursor = page.next_cursor ?? undefined;
    } while (cursor);
    return result;
  };

  const getCustomers = (signal?: AbortSignal) =>
    fetchCursorPages("customers", CustomerSchema, {}, signal);

  const getProjects = (signal?: AbortSignal) =>
    fetchCursorPages("projects", ProjectSchema, {}, signal);

  const getProjectDetail = async (id: Identifier, signal?: AbortSignal) => {
    const key = String(id);
    const cached = projectDetailCache.get(key);
    if (cached) return cached;
    const detail = await client.get(
      `projects/${encodeURIComponent(key)}`,
      ProjectDetailSchema,
      { signal },
    );
    projectDetailCache.set(key, detail);
    return detail;
  };

  const readResource = async (
    resource: string,
    signal?: AbortSignal,
    filter: Record<string, unknown> = {},
  ): Promise<RaRecord[]> => {
    switch (normalizeResource(resource)) {
      case "companies":
        return (await getCustomers(signal)).map(mapCustomer);
      case "contacts":
        return (
          await fetchCursorPages(
            "contacts",
            ContactSchema,
            { customer_id: queryId(filter.company_id) },
            signal,
          )
        ).map(mapContact);
      case "social_accounts":
        return (
          await fetchCursorPages(
            "social-accounts",
            SocialAccountSchema,
            { customer_id: queryId(filter.company_id) },
            signal,
          )
        ).map(mapSocialAccount);
      case "deals":
        return (await getProjects(signal)).map(mapProject);
      case "follow_ups":
        return (
          await fetchCursorPages("follow-ups", FollowUpSchema, {}, signal)
        ).map(mapFollowUp);
      case "reminders":
        return (
          await fetchCursorPages("reminders", ReminderSchema, {}, signal)
        ).map(mapReminder);
      case "deal_risks":
        return (
          await fetchCursorPages(
            "risks",
            RiskSchema,
            { project_id: queryId(filter.deal_id) },
            signal,
          )
        ).map((risk) => mapRisk(risk));
      case "deal_milestones":
        return (
          await fetchCursorPages(
            "milestones",
            MilestoneSchema,
            { project_id: queryId(filter.deal_id) },
            signal,
          )
        ).map((milestone) => mapMilestone(milestone));
      case "sales":
        return [localSale];
      default:
        if (EMPTY_RESOURCES.has(resource)) return [];
        throw unsupported(resource, "list");
    }
  };

  const getRecord = async (
    resource: string,
    id: Identifier,
    signal?: AbortSignal,
  ): Promise<RaRecord> => {
    const normalized = normalizeResource(resource);
    if (normalized === "companies") {
      const detail = await client.get(
        `customers/${encodeURIComponent(String(id))}`,
        CustomerDetailSchema,
        { signal },
      );
      return {
        ...mapCustomer(detail),
        nb_contacts: detail.contacts?.length ?? 0,
        nb_deals: detail.projects?.length ?? 0,
      };
    }
    if (normalized === "deals") {
      return mapProject(await getProjectDetail(id, signal));
    }
    const records = await readResource(normalized, signal);
    const record = records.find((item) => String(item.id) === String(id));
    if (!record) throw notFound(normalized, id);
    return record;
  };

  const provider: DataProvider = {
    async getList<RecordType extends RaRecord = RaRecord>(
      resource: string,
      params: GetListParams,
    ) {
      const records = await readResource(
        resource,
        params.signal,
        params.filter ?? {},
      );
      const filtered = records.filter((record) =>
        matchesFilter(record, params.filter ?? {}),
      );
      const sorted = sortRecords(filtered, params.sort);
      const page = params.pagination?.page ?? 1;
      const perPage = params.pagination?.perPage ?? sorted.length;
      const start = Math.max(0, page - 1) * perPage;
      return {
        data: sorted.slice(start, start + perPage) as RecordType[],
        total: sorted.length,
      };
    },

    async getOne<RecordType extends RaRecord = RaRecord>(
      resource: string,
      params: GetOneParams,
    ) {
      return {
        data: (await getRecord(
          resource,
          params.id,
          params.signal,
        )) as RecordType,
      };
    },

    async getMany<RecordType extends RaRecord = RaRecord>(
      resource: string,
      params: GetManyParams,
    ) {
      const records = await readResource(resource, params.signal);
      const byId = new Map(
        records.map((record) => [String(record.id), record]),
      );
      return {
        data: params.ids
          .map((id) => byId.get(String(id)))
          .filter(Boolean) as RecordType[],
      };
    },

    async getManyReference<RecordType extends RaRecord = RaRecord>(
      resource: string,
      params: GetManyReferenceParams,
    ) {
      return provider.getList<RecordType>(resource, {
        ...params,
        filter: { ...params.filter, [params.target]: params.id },
      });
    },

    async create<RecordType extends RaRecord = RaRecord>(
      resource: string,
      params: CreateParams,
    ) {
      projectDetailCache.clear();
      return {
        data: (await createRecord(resource, params.data, client)) as RecordType,
      };
    },

    async update<RecordType extends RaRecord = RaRecord>(
      resource: string,
      params: UpdateParams,
    ) {
      projectDetailCache.clear();
      return {
        data: (await updateRecord(resource, params, client)) as RecordType,
      };
    },

    async updateMany(resource: string, params: UpdateManyParams) {
      const updated: Identifier[] = [];
      for (const id of params.ids) {
        const previousData = await getRecord(resource, id);
        await provider.update(resource, {
          id,
          data: params.data,
          previousData,
        });
        updated.push(id);
      }
      return { data: updated };
    },

    async delete<RecordType extends RaRecord = RaRecord>(
      resource: string,
      params: DeleteParams,
    ) {
      projectDetailCache.clear();
      await deleteRecord(resource, params.id, client);
      return {
        data: (params.previousData ?? { id: params.id }) as RecordType,
      };
    },

    async deleteMany(resource: string, params: DeleteManyParams) {
      const deleted: Identifier[] = [];
      for (const id of params.ids) {
        await deleteRecord(resource, id, client);
        deleted.push(id);
      }
      return { data: deleted };
    },
  };

  return Object.assign(provider, {
    capabilities: AGENT_CRM_CAPABILITIES,
    supportsPermanentDealDeletion: false,
    async unarchiveDeal(deal: Deal) {
      projectDetailCache.clear();
      const project = await client.put(
        `projects/${encodeURIComponent(String(deal.id))}/stage`,
        { stage: "lead" },
        ProjectSchema,
      );
      return [{ data: mapProject(project) }];
    },
    async mergeContacts(_sourceId: Identifier, _targetId: Identifier) {
      throw unsupported("contacts", "merge");
    },
    async getConfiguration(): Promise<ConfigurationContextValue> {
      const stored = configurationStorage.getItem(
        AGENT_CONFIGURATION_STORAGE_KEY,
      );
      if (!stored) return agentConfiguration;
      try {
        return { ...agentConfiguration, ...JSON.parse(stored) };
      } catch {
        return agentConfiguration;
      }
    },
    async updateConfiguration(config: ConfigurationContextValue) {
      configurationStorage.setItem(
        AGENT_CONFIGURATION_STORAGE_KEY,
        JSON.stringify(config),
      );
      return config;
    },
  }) as unknown as CrmDataProvider;
}

async function createRecord(
  resource: string,
  data: any,
  client: AgentClient,
): Promise<RaRecord> {
  switch (normalizeResource(resource)) {
    case "companies":
      return mapCustomer(
        await client.post(
          "customers",
          compact({
            name: data.name,
            company: data.company,
            country: data.country,
            source: data.source,
            grade: data.grade,
            status: data.status,
          }),
          CustomerSchema,
        ),
      );
    case "contacts": {
      const companyId = requiredId(data.company_id, "company_id");
      return mapContact(
        await client.post(
          `customers/${encodeURIComponent(companyId)}/contacts`,
          compact({
            name: contactName(data),
            title: data.title,
            email:
              "email_jsonb" in data
                ? (firstEmail(data.email_jsonb) ?? "")
                : undefined,
            phone:
              "phone_jsonb" in data
                ? (firstPhone(data.phone_jsonb) ?? "")
                : undefined,
          }),
          ContactSchema,
        ),
      );
    }
    case "social_accounts": {
      const companyId = requiredId(data.company_id, "company_id");
      return mapSocialAccount(
        await client.post(
          `customers/${encodeURIComponent(companyId)}/social-accounts`,
          compact({
            platform: data.platform,
            raw_identifier: data.raw_identifier,
            contact_id: data.contact_id,
          }),
          SocialAccountSchema,
        ),
      );
    }
    case "deals":
      return mapProject(
        await client.post(
          "projects",
          withNullableClosedReason(data, {
            customer_id: requiredId(data.company_id, "company_id"),
            name: data.name,
            currency: data.currency,
            amount: data.amount,
            probability: data.probability,
            expected_close_date: data.expected_closing_date,
            stage: normalizeInputStage(data.stage),
            grade: data.grade,
          }),
          ProjectSchema,
        ),
      );
    case "follow_ups":
      return mapFollowUp(
        await client.post(
          "follow-ups",
          compact({
            customer_id: requiredId(data.company_id, "company_id"),
            project_id: data.deal_id,
            type: data.type,
            note: data.note,
            message_body: data.message_body,
            message_direction: data.message_direction,
            occurred_at: data.occurred_at,
          }),
          FollowUpSchema,
        ),
      );
    case "reminders":
      return mapReminder(
        await client.post(
          "reminders",
          compact({
            customer_id: requiredId(data.company_id, "company_id"),
            project_id: data.deal_id,
            type: data.type,
            due_at: data.due_at,
            priority: data.priority,
            pause_reason: data.pause_reason,
            reevaluate_at: data.reevaluate_at,
          }),
          ReminderSchema,
        ),
      );
    case "deal_risks": {
      const dealId = requiredId(data.deal_id, "deal_id");
      return mapRisk(
        await client.post(
          `projects/${encodeURIComponent(dealId)}/risks`,
          omitUndefined({
            description: data.description,
            severity: data.severity,
            status: data.status,
            handled_at: data.handled_at,
          }),
          RiskSchema,
        ),
      );
    }
    case "deal_milestones": {
      const dealId = requiredId(data.deal_id, "deal_id");
      return mapMilestone(
        await client.post(
          `projects/${encodeURIComponent(dealId)}/milestones`,
          compact({
            name: data.name,
            date: data.due_date,
            completed: data.completed,
          }),
          MilestoneSchema,
        ),
      );
    }
    default:
      throw unsupported(resource, "create");
  }
}

async function updateRecord(
  resource: string,
  params: UpdateParams,
  client: AgentClient,
): Promise<RaRecord> {
  const data = params.data as any;
  const id = encodeURIComponent(String(params.id));
  switch (normalizeResource(resource)) {
    case "companies":
      return mapCustomer(
        await client.put(
          `customers/${id}`,
          compact(
            pick(data, [
              "name",
              "company",
              "country",
              "source",
              "grade",
              "status",
            ]),
          ),
          CustomerSchema,
        ),
      );
    case "contacts":
      return mapContact(
        await client.put(
          `contacts/${id}`,
          compact({
            name: contactName(data),
            title: data.title,
            email:
              "email_jsonb" in data
                ? (firstEmail(data.email_jsonb) ?? "")
                : undefined,
            phone:
              "phone_jsonb" in data
                ? (firstPhone(data.phone_jsonb) ?? "")
                : undefined,
          }),
          ContactSchema,
        ),
      );
    case "deals": {
      if (data.archived_at != null) {
        await client.delete(`projects/${id}`, agentVoidParser, {
          body: omitUndefined({
            reason: data.closed_reason ?? params.previousData?.closed_reason,
          }),
        });
        return mapProject(
          await client.get(`projects/${id}`, ProjectDetailSchema),
        );
      }
      return mapProject(
        await client.put(
          `projects/${id}`,
          withNullableClosedReason(data, {
            name: data.name,
            currency: data.currency,
            amount: data.amount,
            probability: data.probability,
            expected_close_date: data.expected_closing_date,
            stage:
              data.stage == null ? undefined : normalizeInputStage(data.stage),
            grade: data.grade,
          }),
          ProjectSchema,
        ),
      );
    }
    case "follow_ups":
      return mapFollowUp(
        await client.put(
          `follow-ups/${id}`,
          compact({
            type: data.type,
            note: data.note,
            message_body: data.message_body,
            message_direction: data.message_direction,
            occurred_at: data.occurred_at,
          }),
          FollowUpSchema,
        ),
      );
    case "reminders":
      return mapReminder(
        await client.put(
          `reminders/${id}`,
          compact({
            status: data.status,
            snooze_until: data.snooze_until,
            resolution: data.resolution,
          }),
          ReminderSchema,
        ),
      );
    case "deal_risks":
      return mapRisk(
        await client.put(
          `risks/${id}`,
          omitUndefined({
            description: data.description,
            severity: data.severity,
            status: data.status,
            handled_at: data.handled_at,
          }),
          RiskSchema,
        ),
      );
    case "deal_milestones":
      return mapMilestone(
        await client.put(
          `milestones/${id}`,
          compact({
            name: data.name,
            date: data.due_date,
            completed: data.completed,
          }),
          MilestoneSchema,
        ),
      );
    default:
      throw unsupported(resource, "update");
  }
}

async function deleteRecord(
  resource: string,
  id: Identifier,
  client: AgentClient,
) {
  const encodedId = encodeURIComponent(String(id));
  switch (normalizeResource(resource)) {
    case "companies":
      return client.delete(`customers/${encodedId}`, agentVoidParser);
    case "contacts":
      return client.delete(`contacts/${encodedId}`, agentVoidParser);
    case "social_accounts":
      return client.delete(`social-accounts/${encodedId}`, agentVoidParser);
    case "deals":
      throw unsupported("deals", "permanent delete");
    case "follow_ups":
      return client.delete(`follow-ups/${encodedId}`, agentVoidParser);
    case "deal_risks":
      return client.delete(`risks/${encodedId}`, agentVoidParser);
    case "deal_milestones":
      return client.delete(`milestones/${encodedId}`, agentVoidParser);
    default:
      throw unsupported(resource, "delete");
  }
}

const localSale: RaRecord = {
  id: LOCAL_AGENT_USER_ID,
  user_id: LOCAL_AGENT_USER_ID,
  first_name: "本地",
  last_name: "用户",
  email: "local@dealpilot.invalid",
  administrator: true,
  disabled: false,
};

const agentConfiguration: ConfigurationContextValue = {
  ...defaultConfiguration,
  dealStages: [
    { value: "lead", label: "需求确认" },
    { value: "qualified", label: "方案/样品" },
    { value: "proposal", label: "报价" },
    { value: "negotiation", label: "谈判" },
    { value: "closed_won", label: "成交" },
    { value: "closed_lost", label: "失单" },
    { value: "archived", label: "已归档" },
  ],
  dealPipelineStatuses: ["closed_won"],
};

function cursorPageParser<T>(parser: Parser<T>): Parser<CursorPage<T>> {
  return {
    parse(value) {
      if (!value || typeof value !== "object") {
        throw new Error("Expected a cursor page");
      }
      const page = value as { items?: unknown; next_cursor?: unknown };
      if (!Array.isArray(page.items)) throw new Error("Expected page items");
      if (page.next_cursor !== null && typeof page.next_cursor !== "string") {
        throw new Error("Expected next_cursor");
      }
      return {
        items: page.items.map((item) => parser.parse(item)),
        next_cursor: page.next_cursor,
      };
    },
  };
}

function matchesFilter(record: RaRecord, filter: Record<string, any>): boolean {
  return Object.entries(filter).every(([rawKey, expected]) => {
    if (expected == null || expected === "") return true;
    if (rawKey === "q") {
      return JSON.stringify(record)
        .toLocaleLowerCase()
        .includes(String(expected).toLocaleLowerCase());
    }
    if (rawKey === "@or" && expected && typeof expected === "object") {
      return Object.entries(expected).some(([key, value]) =>
        matchesFilter(record, { [key]: value }),
      );
    }
    const [key, operator = "eq"] = rawKey.split("@");
    const actual = (record as Record<string, unknown>)[key];
    if (operator === "neq") return String(actual) !== String(expected);
    if (operator === "in" && Array.isArray(expected)) {
      return expected.some((item) => String(item) === String(actual));
    }
    if (operator === "ilike") {
      return String(actual ?? "")
        .toLocaleLowerCase()
        .includes(String(expected).replaceAll("%", "").toLocaleLowerCase());
    }
    return String(actual) === String(expected);
  });
}

function queryId(value: unknown): string | undefined {
  return typeof value === "string" || typeof value === "number"
    ? String(value)
    : undefined;
}

function sortRecords(
  records: RaRecord[],
  sort?: { field: string; order: "ASC" | "DESC" },
) {
  if (!sort) return records;
  const direction = sort.order === "DESC" ? -1 : 1;
  return [...records].sort(
    (left, right) =>
      String((left as any)[sort.field] ?? "").localeCompare(
        String((right as any)[sort.field] ?? ""),
        undefined,
        { numeric: true },
      ) * direction,
  );
}

function normalizeResource(resource: string) {
  if (resource === "companies_summary") return "companies";
  if (resource === "contacts_summary") return "contacts";
  return resource;
}

function compact(input: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(input).filter(
      ([, value]) => value !== undefined && value !== null,
    ),
  );
}

function omitUndefined(input: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined),
  );
}

function withNullableClosedReason(
  data: Record<string, unknown>,
  input: Record<string, unknown>,
) {
  return {
    ...compact(input),
    ...(data.closed_reason !== undefined
      ? { closed_reason: data.closed_reason }
      : {}),
  };
}

function pick(input: Record<string, unknown>, keys: string[]) {
  return Object.fromEntries(
    keys.filter((key) => key in input).map((key) => [key, input[key]]),
  );
}

function contactName(data: any) {
  const name = [data.first_name, data.last_name]
    .filter(Boolean)
    .join(" ")
    .trim();
  return name || data.name;
}

function firstEmail(value: unknown) {
  return Array.isArray(value) ? value[0]?.email : undefined;
}

function firstPhone(value: unknown) {
  return Array.isArray(value) ? value[0]?.number : undefined;
}

function requiredId(value: unknown, field: string) {
  if (typeof value === "string" && value) return value;
  throw new ApiError({
    code: API_ERROR_CODES.validation,
    message: `${field} is required`,
  });
}

function normalizeInputStage(stage: string) {
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

function unsupported(resource: string, operation: string) {
  return new ApiError({
    code: "AGENT_OPERATION_UNSUPPORTED",
    message: `Local Agent does not support ${operation} on ${resource}`,
  });
}

function notFound(resource: string, id: Identifier) {
  return new ApiError({
    code: API_ERROR_CODES.notFound,
    message: `${resource} record ${String(id)} was not found`,
    status: 404,
  });
}
