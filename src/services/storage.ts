import type { DailySession } from "../types";

const STORAGE_KEY = "per_diem_tracker_v1";
const MAX_AGE_DAYS = 7;
const MAX_AGE_MS = MAX_AGE_DAYS * 24 * 60 * 60 * 1000;

type StoreShape = {
  sessions: DailySession[];
};

const nowIso = () => new Date().toISOString();

const isFresh = (createdAt: string): boolean => {
  const ts = new Date(createdAt).getTime();
  if (Number.isNaN(ts)) return false;
  return Date.now() - ts <= MAX_AGE_MS;
};

const parseStore = (): StoreShape => {
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return { sessions: [] };
  try {
    const parsed = JSON.parse(raw) as StoreShape;
    if (!Array.isArray(parsed.sessions)) return { sessions: [] };
    return { sessions: parsed.sessions.filter((item) => item && isFresh(item.createdAt)) };
  } catch {
    return { sessions: [] };
  }
};

const persist = (store: StoreShape) => {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
};

export const RetentionService = {
  prune() {
    const store = parseStore();
    persist(store);
  },
};

export const SessionStore = {
  getByDateKey(dateKey: string): DailySession | null {
    const store = parseStore();
    return store.sessions.find((item) => item.dateKey === dateKey) ?? null;
  },

  save(session: Omit<DailySession, "createdAt"> & { createdAt?: string }) {
    const store = parseStore();
    const createdAt = session.createdAt ?? nowIso();
    const next: DailySession = { ...session, createdAt };
    const remaining = store.sessions.filter((item) => item.dateKey !== session.dateKey);
    remaining.push(next);
    persist({ sessions: remaining.filter((item) => isFresh(item.createdAt)) });
  },
};
