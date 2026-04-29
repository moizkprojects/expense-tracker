import * as SQLite from "expo-sqlite";
import rates from "../../assets/rates/fy2026_master.json";
import { normalizeCounty, normalizeText } from "../utils/normalize";

const DB_NAME = "perdiem_tracker.db";
const SEEDED_KEY = "rates_seeded_v1";

let db: SQLite.SQLiteDatabase | null = null;

export const getDb = async (): Promise<SQLite.SQLiteDatabase> => {
  if (db) return db;
  db = await SQLite.openDatabaseAsync(DB_NAME);
  await db.execAsync("PRAGMA foreign_keys = ON;");
  return db;
};

export const initializeDb = async () => {
  const sqlite = await getDb();
  await sqlite.execAsync(`
    CREATE TABLE IF NOT EXISTS app_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS rates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      state TEXT NOT NULL,
      destination_city TEXT NOT NULL,
      county TEXT NOT NULL,
      season_start TEXT NOT NULL,
      season_end TEXT NOT NULL,
      mie_rate INTEGER NOT NULL,
      state_norm TEXT NOT NULL,
      city_norm TEXT NOT NULL,
      county_norm TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_rates_city_state ON rates(city_norm, state_norm);
    CREATE INDEX IF NOT EXISTS idx_rates_county_state ON rates(county_norm, state_norm);

    CREATE TABLE IF NOT EXISTS daily_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date_text TEXT NOT NULL UNIQUE,
      location_input TEXT NOT NULL,
      resolved_city TEXT,
      resolved_county TEXT,
      state TEXT NOT NULL,
      mie_rate INTEGER NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      amount REAL NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(session_id) REFERENCES daily_sessions(id) ON DELETE CASCADE
    );
  `);
};

export const seedRatesIfNeeded = async () => {
  const sqlite = await getDb();
  const meta = await sqlite.getFirstAsync<{ value: string }>(
    "SELECT value FROM app_meta WHERE key = ?",
    [SEEDED_KEY]
  );

  if (meta?.value === "1") return;

  await sqlite.execAsync("DELETE FROM rates;");

  const insertSql = `
    INSERT INTO rates (
      state,
      destination_city,
      county,
      season_start,
      season_end,
      mie_rate,
      state_norm,
      city_norm,
      county_norm
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);
  `;

  for (const row of rates as Array<{
    state: string;
    destination: string;
    county: string;
    seasonBegin: string;
    seasonEnd: string;
    mieRate: number;
  }>) {
    await sqlite.runAsync(insertSql, [
      row.state,
      row.destination,
      row.county,
      row.seasonBegin ?? "",
      row.seasonEnd ?? "",
      row.mieRate,
      normalizeText(row.state),
      normalizeText(row.destination),
      normalizeCounty(row.county),
    ]);
  }

  await sqlite.runAsync(
    "INSERT OR REPLACE INTO app_meta (key, value) VALUES (?, ?)",
    [SEEDED_KEY, "1"]
  );
};
