import type { Db } from "./dataGenerator/types";
import { createDataProvider } from "./dataProvider";
import {
  loadDemoData,
  resetDemoData,
  type DemoDataStorage,
} from "./demoDataPersistence";

class MemoryStorage implements DemoDataStorage {
  private values = new Map<string, string>();

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }

  removeItem(key: string) {
    this.values.delete(key);
  }
}

const storageKey = "demo-persistence-test";

const createDb = (companyName = "Seed Company") =>
  ({
    companies: [
      {
        id: 1,
        name: companyName,
        logo: { src: "data:image/png;base64,seed" },
        nb_contacts: 0,
        nb_deals: 0,
      },
    ],
    contacts: [],
    contact_notes: [],
    deals: [],
    deal_notes: [],
    sales: [
      {
        id: 1,
        user_id: "1",
        first_name: "Demo",
        last_name: "User",
        email: "demo@example.com",
        password: "must-not-persist",
        access_token: "must-not-persist",
        administrator: true,
      },
    ],
    tags: [],
    tasks: [],
    social_accounts: [],
    follow_ups: [],
    reminders: [],
    deal_risks: [],
    deal_milestones: [],
    configuration: [{ id: 1, config: {} }],
  }) as unknown as Db;

const readSnapshot = (storage: DemoDataStorage) =>
  JSON.parse(storage.getItem(storageKey) as string) as {
    version: number;
    data: Db;
  };

describe("Demo data persistence", () => {
  it("writes a generated seed on first use without auth secrets", () => {
    const storage = new MemoryStorage();
    const seed = vi.fn(() => createDb());

    const data = loadDemoData({ storage, storageKey, seed, version: 1 });

    expect(data.companies[0]?.name).toBe("Seed Company");
    expect(seed).toHaveBeenCalledOnce();
    expect(readSnapshot(storage).data.sales[0]?.password).toBeUndefined();
    expect(readSnapshot(storage).data.sales[0]).not.toHaveProperty(
      "access_token",
    );
  });

  it("persists successful provider writes", async () => {
    const storage = new MemoryStorage();
    const provider = createDataProvider({
      latency: 0,
      silent: true,
      persistence: { storage, storageKey, seed: () => createDb() },
    });

    await provider.update("companies", {
      id: 1,
      data: { name: "Updated Company" },
      previousData: createDb().companies[0],
    });

    expect(readSnapshot(storage).data.companies[0]?.name).toBe(
      "Updated Company",
    );
  });

  it("restores persisted writes when a provider is recreated", async () => {
    const storage = new MemoryStorage();
    const persistence = { storage, storageKey, seed: () => createDb() };
    const firstProvider = createDataProvider({
      latency: 0,
      silent: true,
      persistence,
    });
    await firstProvider.update("companies", {
      id: 1,
      data: { name: "Survives Refresh" },
      previousData: createDb().companies[0],
    });

    const refreshedProvider = createDataProvider({
      latency: 0,
      silent: true,
      persistence,
    });
    const result = await refreshedProvider.getOne("companies", { id: 1 });

    expect(result.data.name).toBe("Survives Refresh");
  });

  it("restores DealPilot domain resources when a provider is recreated", async () => {
    const storage = new MemoryStorage();
    const persistence = { storage, storageKey, seed: () => createDb() };
    const firstProvider = createDataProvider({
      latency: 0,
      silent: true,
      persistence,
    });
    const created = await firstProvider.create("reminders", {
      data: {
        company_id: 1,
        deal_id: null,
        type: "fixed_time",
        due_at: "2026-08-01T09:00:00.000Z",
      },
    });

    const refreshedProvider = createDataProvider({
      latency: 0,
      silent: true,
      persistence,
    });
    const result = await refreshedProvider.getOne("reminders", {
      id: created.data.id,
    });

    expect(result.data).toMatchObject({
      status: "pending",
      priority: "normal",
      due_at: "2026-08-01T09:00:00.000Z",
    });
  });

  it("replaces a snapshot when its version no longer matches", () => {
    const storage = new MemoryStorage();
    loadDemoData({
      storage,
      storageKey,
      seed: () => createDb("Old Seed"),
      version: 1,
    });

    const data = loadDemoData({
      storage,
      storageKey,
      seed: () => createDb("New Seed"),
      version: 2,
    });

    expect(data.companies[0]?.name).toBe("New Seed");
    expect(readSnapshot(storage).version).toBe(2);
  });

  it("recovers from a damaged snapshot and supports an explicit reset", () => {
    const storage = new MemoryStorage();
    storage.setItem(storageKey, "{not-json");

    const data = loadDemoData({
      storage,
      storageKey,
      seed: () => createDb("Recovered Seed"),
      version: 1,
    });

    expect(data.companies[0]?.name).toBe("Recovered Seed");
    expect(readSnapshot(storage).data.companies[0]?.name).toBe(
      "Recovered Seed",
    );

    resetDemoData(storage, storageKey);
    expect(storage.getItem(storageKey)).toBeNull();
  });
});
