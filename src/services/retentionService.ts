import { getDb } from "../db/database";

export const cutoffIso = (days: number, now = new Date()) => {
  const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  return cutoff.toISOString();
};

export const RetentionService = {
  async pruneOlderThan(days = 7): Promise<void> {
    const sqlite = await getDb();
    const cutoff = cutoffIso(days);
    await sqlite.runAsync("DELETE FROM expenses WHERE created_at < ?", [cutoff]);
    await sqlite.runAsync("DELETE FROM daily_sessions WHERE created_at < ?", [cutoff]);
  },
};
