import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { config } from "./config.js";

fs.mkdirSync(config.dataDir, { recursive: true });
const dbPath = path.join(config.dataDir, "smutstream.sqlite");

export const db = new Database(dbPath);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  token TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS groups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  tags TEXT NOT NULL,            -- space-separated tag string
  image_limit INTEGER NOT NULL DEFAULT 50,
  enabled INTEGER NOT NULL DEFAULT 1,
  priority INTEGER NOT NULL DEFAULT 0, -- higher = more frequent
  created_by INTEGER,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS group_contributions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  group_id INTEGER NOT NULL,
  user_id INTEGER,
  action TEXT NOT NULL,          -- 'create' | 'add_tag' | 'remove_tag' | 'enable' | 'disable' | 'delete'
  detail TEXT,
  at INTEGER NOT NULL,
  FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS post_votes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id INTEGER NOT NULL,
  user_id INTEGER,
  kind TEXT NOT NULL,            -- 'up' | 'down' | 'download'
  at INTEGER NOT NULL,
  UNIQUE(post_id, user_id, kind)
);

CREATE INDEX IF NOT EXISTS idx_votes_post ON post_votes(post_id);
CREATE INDEX IF NOT EXISTS idx_contrib_group ON group_contributions(group_id);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS post_comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id INTEGER NOT NULL,
  user_id INTEGER,
  user_name TEXT,
  text TEXT NOT NULL,
  at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_comments_post ON post_comments(post_id);

CREATE TABLE IF NOT EXISTS blocked_posts (
  post_id INTEGER PRIMARY KEY,
  blocked_by INTEGER,
  blocked_name TEXT,
  at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS blocked_artists (
  artist TEXT PRIMARY KEY,
  blocked_by INTEGER,
  blocked_name TEXT,
  at INTEGER NOT NULL
);
`);

export type DbComment = {
  id: number;
  post_id: number;
  user_id: number | null;
  user_name: string | null;
  text: string;
  at: number;
};

export type DbUser = { id: number; token: string; name: string; created_at: number };
export type DbGroup = {
  id: number;
  name: string;
  tags: string;
  image_limit: number;
  enabled: number;
  priority: number;
  created_by: number | null;
  created_at: number;
};
export type DbContribution = {
  id: number;
  group_id: number;
  user_id: number | null;
  action: string;
  detail: string | null;
  at: number;
};
export type DbVote = {
  id: number;
  post_id: number;
  user_id: number | null;
  kind: string;
  at: number;
};
