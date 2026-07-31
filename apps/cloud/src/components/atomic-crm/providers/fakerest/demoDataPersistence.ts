import type {
  CreateParams,
  DataProvider,
  DeleteManyParams,
  DeleteParams,
  Identifier,
  RaRecord,
  UpdateManyParams,
  UpdateParams,
} from "ra-core";

import type { Db } from "./dataGenerator/types";

export const DEMO_DATA_STORAGE_KEY = "dealpilot.demo-data";
export const DEMO_DATA_VERSION = 4;

export type DemoDataStorage = Pick<
  Storage,
  "getItem" | "setItem" | "removeItem"
>;

type DemoDataSnapshot = {
  version: number;
  data: Db;
};

type LoadDemoDataOptions = {
  storage: DemoDataStorage;
  seed: () => Db;
  storageKey?: string;
  version?: number;
};

type PersistDemoDataOptions = {
  storage: DemoDataStorage;
  storageKey?: string;
  version?: number;
};

const demoResources = [
  "companies",
  "contacts",
  "contact_notes",
  "deals",
  "deal_notes",
  "sales",
  "tags",
  "tasks",
  "social_accounts",
  "follow_ups",
  "reminders",
  "deal_risks",
  "deal_milestones",
  "configuration",
] as const satisfies ReadonlyArray<keyof Db>;

type DemoResource = (typeof demoResources)[number];
type MutableRecord = RaRecord & Record<string, unknown>;
type MutableDb = Record<DemoResource, MutableRecord[]>;

const sensitiveKeys = new Set([
  "access_token",
  "auth_token",
  "password",
  "refresh_token",
  "token",
]);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isDemoResource = (resource: string): resource is DemoResource =>
  (demoResources as readonly string[]).includes(resource);

const isDb = (value: unknown): value is Db =>
  isRecord(value) &&
  demoResources.every((resource) => Array.isArray(value[resource]));

const sanitizeForSnapshot = (db: Db): Db => {
  const businessData = Object.fromEntries(
    demoResources.map((resource) => [resource, db[resource]]),
  );

  return JSON.parse(
    JSON.stringify(businessData, (key, value) =>
      sensitiveKeys.has(key.toLowerCase()) ? undefined : value,
    ),
  ) as Db;
};

const replaceWithSeed = ({
  storage,
  seed,
  storageKey = DEMO_DATA_STORAGE_KEY,
  version = DEMO_DATA_VERSION,
}: LoadDemoDataOptions): Db => {
  const data = seed();
  persistDemoData(data, { storage, storageKey, version });
  return data;
};

export const getBrowserDemoDataStorage = (): DemoDataStorage | undefined => {
  if (typeof window === "undefined") return undefined;

  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
};

export const loadDemoData = (options: LoadDemoDataOptions): Db => {
  const {
    storage,
    storageKey = DEMO_DATA_STORAGE_KEY,
    version = DEMO_DATA_VERSION,
  } = options;

  let serialized: string | null;
  try {
    serialized = storage.getItem(storageKey);
  } catch {
    return options.seed();
  }

  if (!serialized) return replaceWithSeed(options);

  try {
    const snapshot = JSON.parse(serialized) as Partial<DemoDataSnapshot>;
    if (snapshot.version !== version || !isDb(snapshot.data)) {
      return replaceWithSeed(options);
    }
    return snapshot.data;
  } catch {
    return replaceWithSeed(options);
  }
};

export const persistDemoData = (
  db: Db,
  {
    storage,
    storageKey = DEMO_DATA_STORAGE_KEY,
    version = DEMO_DATA_VERSION,
  }: PersistDemoDataOptions,
): boolean => {
  const snapshot: DemoDataSnapshot = {
    version,
    data: sanitizeForSnapshot(db),
  };

  try {
    storage.setItem(storageKey, JSON.stringify(snapshot));
    return true;
  } catch (error) {
    console.warn("Unable to persist Demo data", error);
    return false;
  }
};

export const resetDemoData = (
  storage = getBrowserDemoDataStorage(),
  storageKey = DEMO_DATA_STORAGE_KEY,
): void => {
  if (!storage) return;
  storage.removeItem(storageKey);
};

const cloneRecord = <RecordType extends MutableRecord>(
  record: RecordType,
): RecordType => JSON.parse(JSON.stringify(record)) as RecordType;

const createMirror = (db: Db): MutableDb =>
  sanitizeForSnapshot(db) as unknown as MutableDb;

const replaceRecord = (
  mirror: MutableDb,
  resource: DemoResource,
  record: MutableRecord,
) => {
  const collection = mirror[resource];
  const index = collection.findIndex((item) => item.id === record.id);
  if (index === -1) collection.push(cloneRecord(record));
  else collection[index] = cloneRecord(record);
};

export const withDemoDataPersistence = (
  provider: DataProvider,
  initialDb: Db,
  options: PersistDemoDataOptions,
): DataProvider => {
  const mirror = createMirror(initialDb);
  const persist = () => persistDemoData(mirror as unknown as Db, options);

  return {
    ...provider,
    async create(resource: string, params: CreateParams) {
      const result = await provider.create(resource, params);
      if (isDemoResource(resource)) {
        replaceRecord(mirror, resource, result.data as MutableRecord);
        persist();
      }
      return result;
    },
    async update(resource: string, params: UpdateParams) {
      const result = await provider.update(resource, params);
      if (isDemoResource(resource)) {
        replaceRecord(mirror, resource, result.data as MutableRecord);
        persist();
      }
      return result;
    },
    async updateMany(resource: string, params: UpdateManyParams) {
      const result = await provider.updateMany(resource, params);
      if (isDemoResource(resource)) {
        const ids = new Set<Identifier>(params.ids);
        mirror[resource] = mirror[resource].map((record) =>
          ids.has(record.id)
            ? cloneRecord({ ...record, ...params.data })
            : record,
        );
        persist();
      }
      return result;
    },
    async delete(resource: string, params: DeleteParams) {
      const result = await provider.delete(resource, params);
      if (isDemoResource(resource)) {
        mirror[resource] = mirror[resource].filter(
          (record) => record.id !== params.id,
        );
        persist();
      }
      return result;
    },
    async deleteMany(resource: string, params: DeleteManyParams) {
      const result = await provider.deleteMany(resource, params);
      if (isDemoResource(resource)) {
        const ids = new Set<Identifier>(params.ids);
        mirror[resource] = mirror[resource].filter(
          (record) => !ids.has(record.id),
        );
        persist();
      }
      return result;
    },
  } as DataProvider;
};
