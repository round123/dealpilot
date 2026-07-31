import type { AgentClient } from "./client";
import { describe, expect, it, vi } from "vitest";

import { createAgentDataProvider } from "./dataProvider";
import { mapContact } from "./mappers";

const customerId = "11111111-1111-4111-8111-111111111112";
const projectId = "11111111-1111-4111-8111-111111111113";
const riskId = "11111111-1111-4111-8111-111111111114";
const milestoneId = "11111111-1111-4111-8111-111111111115";
const timestamp = "2026-07-30T08:00:00.000Z";

const customer = {
  id: customerId,
  name: "华东贸易",
  company: "华东贸易有限公司",
  country: "中国",
  source: "展会",
  grade: "A",
  status: "active",
  deleted_at: null,
  created_at: timestamp,
  updated_at: timestamp,
};

const project = {
  id: projectId,
  customer_id: customerId,
  name: "年度采购",
  currency: "CNY",
  amount: 80000,
  probability: 60,
  expected_close_date: "2026-09-30",
  stage: "proposal",
  grade: "A",
  closed_reason: null,
  created_at: timestamp,
  updated_at: timestamp,
};

const risk = {
  id: riskId,
  project_id: projectId,
  description: "预算待批",
  severity: "high",
  status: "open",
  handled_at: "2026-07-29T08:00:00.000Z",
  created_at: "2026-07-20T08:00:00.000Z",
};

const milestone = {
  id: milestoneId,
  project_id: projectId,
  name: "确认报价",
  date: "2026-08-15",
  completed: false,
  created_at: "2026-07-21T08:00:00.000Z",
};

function createClient() {
  const get = vi.fn(
    async (path: string, parser: { parse(value: unknown): unknown }) => {
      if (path === "customers") {
        return parser.parse({ items: [customer], next_cursor: null });
      }
      if (path === `customers/${customerId}`) {
        return parser.parse({
          ...customer,
          contacts: [],
          social_accounts: [],
          recent_follow_ups: [],
          open_reminders: [],
          projects: [
            {
              id: projectId,
              name: project.name,
              stage: project.stage,
              amount: project.amount,
            },
          ],
        });
      }
      if (path === "projects") {
        return parser.parse({ items: [project], next_cursor: null });
      }
      if (path === "contacts" || path === "social-accounts") {
        return parser.parse({ items: [], next_cursor: null });
      }
      if (path === "risks") {
        return parser.parse({ items: [risk], next_cursor: null });
      }
      if (path === "milestones") {
        return parser.parse({ items: [milestone], next_cursor: null });
      }
      if (path === `projects/${projectId}`) {
        return parser.parse({
          ...project,
          risks: [
            {
              id: riskId,
              project_id: projectId,
              description: "预算待批",
              severity: "high",
              status: "open",
              handled_at: "2026-07-29T08:00:00.000Z",
              created_at: "2026-07-20T08:00:00.000Z",
            },
          ],
          milestones: [
            {
              id: milestoneId,
              project_id: projectId,
              name: "确认报价",
              date: "2026-08-15",
              completed: false,
              created_at: "2026-07-21T08:00:00.000Z",
            },
          ],
          open_reminders: [],
        });
      }
      throw new Error(`Unexpected GET ${path}`);
    },
  );
  const post = vi.fn(
    async (
      _path: string,
      _body: unknown,
      parser: { parse(value: unknown): unknown },
    ) => parser.parse(customer),
  );
  const put = vi.fn(
    async (
      _path: string,
      body: any,
      parser: { parse(value: unknown): unknown },
    ) => parser.parse({ ...customer, ...body }),
  );
  const remove = vi.fn(
    async (_path: string, parser: { parse(value: unknown): unknown }) =>
      parser.parse(undefined),
  );
  return { get, post, put, delete: remove } as unknown as AgentClient;
}

describe("Agent data provider", () => {
  it("exposes Agent capabilities and maps the editable contact name", () => {
    const provider = createAgentDataProvider({
      client: createClient(),
      configurationStorage: memoryStorage(),
    });
    const mapped = mapContact({
      id: "11111111-1111-4111-8111-111111111116",
      customer_id: customerId,
      name: "张 三",
      title: "采购经理",
      email: "zhang@example.com",
      phone: "13800138000",
      created_at: timestamp,
    });

    expect(provider.capabilities).toMatchObject({
      contacts: { extendedProfile: false, reassignCompany: false },
      deals: { notes: false },
    });
    expect(mapped).toMatchObject({
      name: "张 三",
      first_name: "张",
      last_name: "三",
    });
  });

  it("uses the same Chinese six-stage pipeline as the local demo", async () => {
    const provider = createAgentDataProvider({
      client: createClient(),
      configurationStorage: memoryStorage(),
    });

    const configuration = await provider.getConfiguration();

    expect(configuration.dealStages).toEqual([
      { value: "lead", label: "需求确认" },
      { value: "qualified", label: "方案/样品" },
      { value: "proposal", label: "报价" },
      { value: "negotiation", label: "谈判" },
      { value: "closed_won", label: "成交" },
      { value: "closed_lost", label: "失单" },
    ]);
  });

  it("lists, reads, creates, updates, and deletes customers", async () => {
    const client = createClient();
    const provider = createAgentDataProvider({
      client,
      configurationStorage: memoryStorage(),
    });

    const listed = await provider.getList("companies", {
      filter: { q: "华东" },
      pagination: { page: 1, perPage: 10 },
      sort: { field: "name", order: "ASC" },
    });
    expect(listed.total).toBe(1);
    expect(listed.data[0]).toMatchObject({
      id: customerId,
      name: "华东贸易",
      grade: "A",
      nb_contacts: 0,
    });

    const detail = await provider.getOne("companies", { id: customerId });
    expect(detail.data).toMatchObject({ id: customerId, nb_deals: 1 });

    await provider.create("companies", { data: { name: "华东贸易" } });
    await provider.update("companies", {
      id: customerId,
      data: { name: "华东外贸" },
      previousData: listed.data[0],
    });
    await provider.delete("companies", {
      id: customerId,
      previousData: listed.data[0],
    });

    expect(client.post).toHaveBeenCalledWith(
      "customers",
      { name: "华东贸易" },
      expect.anything(),
    );
    expect(client.put).toHaveBeenCalledWith(
      `customers/${customerId}`,
      { name: "华东外贸" },
      expect.anything(),
    );
    expect(client.delete).toHaveBeenCalledWith(
      `customers/${customerId}`,
      expect.anything(),
    );
  });

  it("maps Agent project, risk, and milestone field names", async () => {
    const provider = createAgentDataProvider({
      client: createClient(),
      configurationStorage: memoryStorage(),
    });

    const deals = await provider.getList("deals", {
      filter: {},
      pagination: { page: 1, perPage: 10 },
      sort: { field: "name", order: "ASC" },
    });
    expect(deals.data[0]).toMatchObject({
      company_id: customerId,
      expected_closing_date: "2026-09-30",
    });

    const risks = await provider.getList("deal_risks", {
      filter: {},
      pagination: { page: 1, perPage: 10 },
      sort: { field: "id", order: "ASC" },
    });
    expect(risks.data[0]).toMatchObject({
      deal_id: projectId,
      id: riskId,
      handled_at: "2026-07-29T08:00:00.000Z",
      created_at: "2026-07-20T08:00:00.000Z",
      updated_at: "2026-07-20T08:00:00.000Z",
    });

    const milestones = await provider.getList("deal_milestones", {
      filter: {},
      pagination: { page: 1, perPage: 10 },
      sort: { field: "id", order: "ASC" },
    });
    expect(milestones.data[0]).toMatchObject({
      deal_id: projectId,
      due_date: "2026-08-15",
      created_at: "2026-07-21T08:00:00.000Z",
      updated_at: "2026-07-21T08:00:00.000Z",
    });
  });

  it("uses bulk list endpoints and forwards parent filters", async () => {
    const get = vi.fn(
      async (
        _path: string,
        parser: { parse(value: unknown): unknown },
        _options?: { query?: Record<string, unknown> },
      ) => parser.parse({ items: [], next_cursor: null }),
    );
    const provider = createAgentDataProvider({
      client: { ...createClient(), get } as unknown as AgentClient,
      configurationStorage: memoryStorage(),
    });

    await provider.getList("contacts", {
      filter: { company_id: customerId },
      pagination: { page: 1, perPage: 10 },
      sort: { field: "id", order: "ASC" },
    });
    await provider.getList("social_accounts", {
      filter: { company_id: customerId },
      pagination: { page: 1, perPage: 10 },
      sort: { field: "id", order: "ASC" },
    });
    await provider.getList("deal_risks", {
      filter: { deal_id: projectId },
      pagination: { page: 1, perPage: 10 },
      sort: { field: "id", order: "ASC" },
    });
    await provider.getList("deal_milestones", {
      filter: { deal_id: projectId },
      pagination: { page: 1, perPage: 10 },
      sort: { field: "id", order: "ASC" },
    });

    expect(get.mock.calls.map(([path]) => path)).toEqual([
      "contacts",
      "social-accounts",
      "risks",
      "milestones",
    ]);
    expect(get.mock.calls[0]?.[2]).toMatchObject({
      query: { customer_id: customerId, limit: 100 },
    });
    expect(get.mock.calls[1]?.[2]).toMatchObject({
      query: { customer_id: customerId, limit: 100 },
    });
    expect(get.mock.calls[2]?.[2]).toMatchObject({
      query: { project_id: projectId, limit: 100 },
    });
    expect(get.mock.calls[3]?.[2]).toMatchObject({
      query: { project_id: projectId, limit: 100 },
    });
  });

  it("loads 1000 contacts in ten bulk requests without listing customers", async () => {
    const records = Array.from({ length: 1000 }, (_, index) => ({
      id: uuidFor(index + 1),
      customer_id: customerId,
      name: `联系人 ${index + 1}`,
      title: null,
      email: null,
      phone: null,
      created_at: timestamp,
    }));
    const get = vi.fn(
      async (
        path: string,
        parser: { parse(value: unknown): unknown },
        options?: { query?: Record<string, unknown> },
      ) => {
        if (path !== "contacts") throw new Error(`Unexpected GET ${path}`);
        const cursor = options?.query?.cursor;
        const start =
          typeof cursor === "string"
            ? records.findIndex((record) => record.id === cursor) + 1
            : 0;
        const items = records.slice(start, start + 100);
        const nextCursor =
          start + items.length < records.length
            ? (items.at(-1)?.id ?? null)
            : null;
        return parser.parse({ items, next_cursor: nextCursor });
      },
    );
    const provider = createAgentDataProvider({
      client: { ...createClient(), get } as unknown as AgentClient,
      configurationStorage: memoryStorage(),
    });

    const result = await provider.getList("contacts", {
      filter: {},
      pagination: { page: 1, perPage: 25 },
      sort: { field: "id", order: "ASC" },
    });

    expect(result.total).toBe(1000);
    expect(result.data).toHaveLength(25);
    expect(get).toHaveBeenCalledTimes(10);
    expect(get.mock.calls.every(([path]) => path === "contacts")).toBe(true);
  });

  it("persists closed reasons and maps archive lifecycle to Agent semantics", async () => {
    let persisted = { ...project };
    const get = vi.fn(
      async (path: string, parser: { parse(value: unknown): unknown }) => {
        if (path === `projects/${projectId}`) {
          return parser.parse({
            ...persisted,
            risks: [],
            milestones: [],
            open_reminders: [],
          });
        }
        throw new Error(`Unexpected GET ${path}`);
      },
    );
    const post = vi.fn(
      async (
        _path: string,
        body: any,
        parser: { parse(value: unknown): unknown },
      ) => {
        persisted = { ...persisted, ...body };
        return parser.parse(persisted);
      },
    );
    const put = vi.fn(
      async (
        _path: string,
        body: any,
        parser: { parse(value: unknown): unknown },
      ) => {
        persisted = { ...persisted, ...body };
        return parser.parse(persisted);
      },
    );
    const remove = vi.fn(
      async (
        _path: string,
        parser: { parse(value: unknown): unknown },
        options?: { body?: any },
      ) => {
        persisted = {
          ...persisted,
          stage: "archived",
          closed_reason: options?.body?.reason ?? null,
        };
        return parser.parse(undefined);
      },
    );
    const client = { get, post, put, delete: remove } as unknown as AgentClient;
    const provider = createAgentDataProvider({
      client,
      configurationStorage: memoryStorage(),
    });

    await provider.create("deals", {
      data: {
        company_id: customerId,
        name: project.name,
        currency: "CNY",
        stage: "proposal",
        grade: "A",
        closed_reason: "Initial reason",
      },
    });
    await provider.update("deals", {
      id: projectId,
      data: { closed_reason: "Updated reason" },
      previousData: { id: projectId },
    });
    const archived = await provider.update("deals", {
      id: projectId,
      data: {
        archived_at: "2026-07-30T09:00:00.000Z",
        closed_reason: "Archived locally",
      },
      previousData: { id: projectId },
    });

    expect(post).toHaveBeenCalledWith(
      "projects",
      expect.objectContaining({ closed_reason: "Initial reason" }),
      expect.anything(),
    );
    expect(put).toHaveBeenCalledWith(
      `projects/${projectId}`,
      { closed_reason: "Updated reason" },
      expect.anything(),
    );
    expect(remove).toHaveBeenCalledWith(
      `projects/${projectId}`,
      expect.anything(),
      { body: { reason: "Archived locally" } },
    );
    expect(archived.data).toMatchObject({
      id: projectId,
      archived_at: timestamp,
      closed_reason: "Archived locally",
    });

    await provider.unarchiveDeal(archived.data as any);
    expect(put).toHaveBeenLastCalledWith(
      `projects/${projectId}/stage`,
      { stage: "lead" },
      expect.anything(),
    );
    expect(provider.supportsPermanentDealDeletion).toBe(false);
    await expect(
      provider.delete("deals", {
        id: projectId,
        previousData: archived.data,
      }),
    ).rejects.toMatchObject({ code: "AGENT_OPERATION_UNSUPPORTED" });
  });

  it("sends complete risk and milestone writes to Agent routes", async () => {
    const risk = {
      id: riskId,
      project_id: projectId,
      description: "预算待批",
      severity: "high",
      status: "resolved",
      handled_at: timestamp,
      created_at: timestamp,
    };
    const milestone = {
      id: milestoneId,
      project_id: projectId,
      name: "确认报价",
      date: "2026-08-15",
      completed: true,
      created_at: timestamp,
    };
    const post = vi.fn(
      async (
        path: string,
        body: any,
        parser: { parse(value: unknown): unknown },
      ) =>
        parser.parse(
          path.endsWith("/risks")
            ? { ...risk, ...body }
            : { ...milestone, ...body },
        ),
    );
    const put = vi.fn(
      async (
        path: string,
        body: any,
        parser: { parse(value: unknown): unknown },
      ) =>
        parser.parse(
          path.startsWith("risks/")
            ? { ...risk, ...body }
            : { ...milestone, ...body },
        ),
    );
    const remove = vi.fn(
      async (_path: string, parser: { parse(value: unknown): unknown }) =>
        parser.parse(undefined),
    );
    const client = {
      ...createClient(),
      post,
      put,
      delete: remove,
    } as unknown as AgentClient;
    const provider = createAgentDataProvider({
      client,
      configurationStorage: memoryStorage(),
    });

    await provider.create("deal_risks", {
      data: {
        deal_id: projectId,
        description: risk.description,
        severity: risk.severity,
        status: risk.status,
        handled_at: risk.handled_at,
      },
    });
    await provider.update("deal_risks", {
      id: riskId,
      data: {
        description: "预算已确认",
        severity: "medium",
        status: "handling",
        handled_at: null,
      },
      previousData: risk,
    });
    await provider.delete("deal_risks", { id: riskId, previousData: risk });

    await provider.create("deal_milestones", {
      data: {
        deal_id: projectId,
        name: milestone.name,
        due_date: milestone.date,
        completed: true,
      },
    });
    await provider.update("deal_milestones", {
      id: milestoneId,
      data: { name: "签署合同", due_date: "2026-08-20", completed: false },
      previousData: milestone,
    });
    await provider.delete("deal_milestones", {
      id: milestoneId,
      previousData: milestone,
    });

    expect(post).toHaveBeenCalledWith(
      `projects/${projectId}/risks`,
      expect.objectContaining({ status: "resolved", handled_at: timestamp }),
      expect.anything(),
    );
    expect(put).toHaveBeenCalledWith(
      `risks/${riskId}`,
      expect.objectContaining({ description: "预算已确认", handled_at: null }),
      expect.anything(),
    );
    expect(post).toHaveBeenCalledWith(
      `projects/${projectId}/milestones`,
      expect.objectContaining({ date: "2026-08-15", completed: true }),
      expect.anything(),
    );
    expect(put).toHaveBeenCalledWith(
      `milestones/${milestoneId}`,
      { name: "签署合同", date: "2026-08-20", completed: false },
      expect.anything(),
    );
    expect(remove).toHaveBeenCalledWith(`risks/${riskId}`, expect.anything());
    expect(remove).toHaveBeenCalledWith(
      `milestones/${milestoneId}`,
      expect.anything(),
    );
  });
});

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  };
}

function uuidFor(value: number) {
  return `00000000-0000-4000-8000-${value.toString(16).padStart(12, "0")}`;
}
