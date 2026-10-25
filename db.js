import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';

fs.mkdirSync(path.join(config.dataDir, 'uploads'), { recursive: true });
export const db = new DatabaseSync(path.join(config.dataDir, config.dbFile));

// Additive only: CREATE IF NOT EXISTS never drops or changes existing data.
db.exec(`
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  pw_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS profiles (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL, state TEXT NOT NULL, district TEXT NOT NULL, village TEXT NOT NULL,
  farm_size REAL NOT NULL, unit TEXT NOT NULL DEFAULT 'acre',
  soil TEXT NOT NULL DEFAULT 'unknown', irrigation TEXT NOT NULL DEFAULT 'rainfed',
  ph REAL, n_level TEXT, p_level TEXT, k_level TEXT,
  crop TEXT, lat REAL, lon REAL, place TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS weather_cache (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  payload TEXT NOT NULL, fetched_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS manual_weather (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  temp REAL, humidity REAL, rain TEXT
);
CREATE TABLE IF NOT EXISTS analyses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  image_path TEXT NOT NULL, crop TEXT, provider TEXT NOT NULL,
  result TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL, summary TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_history_user ON history(user_id, id DESC);
CREATE INDEX IF NOT EXISTS idx_analyses_user ON analyses(user_id, id DESC);
`);

export const addHistory = (userId, kind, summary) =>
  db.prepare('INSERT INTO history (user_id, kind, summary) VALUES (?,?,?)').run(userId, kind, summary);
