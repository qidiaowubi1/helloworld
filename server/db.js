import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { loadEnv, loadWatchlist } from "./config.js";

export function openDb() {
  const config = loadEnv();
  mkdirSync(dirname(config.dbPath), { recursive: true });
  const db = new DatabaseSync(config.dbPath);
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA foreign_keys = ON;");
  return db;
}

export function migrate(db = openDb()) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS assets (
      ticker TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      theme TEXT NOT NULL,
      asset_group TEXT NOT NULL,
      status TEXT NOT NULL,
      priority INTEGER NOT NULL DEFAULT 999,
      enabled INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS quotes_daily (
      ticker TEXT NOT NULL,
      date TEXT NOT NULL,
      open REAL,
      high REAL,
      low REAL,
      close REAL,
      volume REAL,
      source TEXT NOT NULL,
      fetched_at TEXT NOT NULL,
      PRIMARY KEY (ticker, date)
    );

    CREATE TABLE IF NOT EXISTS market_snapshots (
      date TEXT PRIMARY KEY,
      nasdaq REAL,
      sp500 REAL,
      vix REAL,
      ten_year_yield REAL,
      dxy REAL,
      oil REAL,
      gold REAL,
      mode TEXT NOT NULL,
      fetched_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS news_items (
      id TEXT PRIMARY KEY,
      ticker TEXT NOT NULL,
      published_at TEXT,
      title TEXT NOT NULL,
      summary TEXT,
      url TEXT,
      sentiment TEXT,
      source TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY,
      ticker TEXT NOT NULL,
      date TEXT NOT NULL,
      type TEXT NOT NULL,
      importance TEXT NOT NULL,
      description TEXT NOT NULL,
      source TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS filings (
      id TEXT PRIMARY KEY,
      ticker TEXT NOT NULL,
      filed_at TEXT,
      form_type TEXT NOT NULL,
      description TEXT,
      url TEXT,
      source TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS derived_metrics (
      ticker TEXT PRIMARY KEY,
      as_of TEXT NOT NULL,
      score INTEGER NOT NULL,
      risk_level TEXT NOT NULL,
      trend TEXT NOT NULL,
      volume_ratio REAL NOT NULL,
      relative_strength TEXT NOT NULL,
      daily_change REAL,
      five_day_change REAL,
      twenty_day_change REAL,
      price REAL,
      signals_json TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS update_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      started_at TEXT NOT NULL,
      finished_at TEXT,
      status TEXT NOT NULL,
      provider TEXT NOT NULL,
      errors_json TEXT
    );
  `);

  seedAssets(db);
  return db;
}

export function seedAssets(db = openDb()) {
  const upsert = db.prepare(`
    INSERT INTO assets (ticker, name, theme, asset_group, status, priority, enabled)
    VALUES (?, ?, ?, ?, ?, ?, 1)
    ON CONFLICT(ticker) DO UPDATE SET
      name = excluded.name,
      theme = excluded.theme,
      asset_group = excluded.asset_group,
      status = excluded.status,
      priority = excluded.priority,
      enabled = 1
  `);

  for (const asset of loadWatchlist()) {
    upsert.run(asset.ticker, asset.name, asset.theme, asset.group, asset.status, asset.priority || 999);
  }
}

export function rowToAsset(row) {
  return {
    ticker: row.ticker,
    name: row.name,
    theme: row.theme,
    group: row.asset_group,
    status: row.status,
    priority: row.priority
  };
}
