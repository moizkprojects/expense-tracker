import { getDb } from "../db/database";
import { Expense } from "../types";

const isoNow = () => new Date().toISOString();
const toDateKey = (date: Date) => date.toISOString().slice(0, 10);

export const ExpenseStore = {
  async getOrCreateSession(params: {
    date: Date;
    locationInput: string;
    resolvedCity?: string;
    resolvedCounty?: string;
    state: string;
    mieRate: number;
  }) {
    const sqlite = await getDb();
    const dateText = toDateKey(params.date);
    const existing = await sqlite.getFirstAsync<{ id: number }>(
      "SELECT id FROM daily_sessions WHERE date_text = ?",
      [dateText]
    );

    if (existing?.id) {
      await sqlite.runAsync(
        `UPDATE daily_sessions
         SET location_input = ?, resolved_city = ?, resolved_county = ?, state = ?, mie_rate = ?
         WHERE id = ?`,
        [
          params.locationInput,
          params.resolvedCity ?? null,
          params.resolvedCounty ?? null,
          params.state,
          params.mieRate,
          existing.id,
        ]
      );
      return existing.id;
    }

    const result = await sqlite.runAsync(
      `INSERT INTO daily_sessions
        (date_text, location_input, resolved_city, resolved_county, state, mie_rate, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        dateText,
        params.locationInput,
        params.resolvedCity ?? null,
        params.resolvedCounty ?? null,
        params.state,
        params.mieRate,
        isoNow(),
      ]
    );
    return result.lastInsertRowId;
  },

  async listBySession(sessionId: number): Promise<Expense[]> {
    const sqlite = await getDb();
    const rows = await sqlite.getAllAsync<{ id: number; name: string; amount: number }>(
      "SELECT id, name, amount FROM expenses WHERE session_id = ? ORDER BY id ASC",
      [sessionId]
    );
    return rows.map((item) => ({
      id: item.id,
      name: item.name,
      amount: Number(item.amount),
    }));
  },

  async replaceForSession(sessionId: number, expenses: Expense[]): Promise<void> {
    const sqlite = await getDb();
    await sqlite.runAsync("DELETE FROM expenses WHERE session_id = ?", [sessionId]);

    for (const expense of expenses) {
      if (!expense.name.trim() && !Number.isFinite(expense.amount)) continue;
      if (!expense.name.trim() && expense.amount === 0) continue;
      await sqlite.runAsync(
        `INSERT INTO expenses (session_id, name, amount, created_at)
         VALUES (?, ?, ?, ?)`,
        [sessionId, expense.name.trim(), expense.amount, isoNow()]
      );
    }
  },
};
