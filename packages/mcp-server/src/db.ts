import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema.js";

export const DB_DIR = process.env.AGENT_BOARD_DIR ?? join(homedir(), ".agent-board");
export const DB_PATH = join(DB_DIR, "board.db");

// Keep in sync with schema.ts. Runs on every startup; safe because of IF NOT EXISTS.
const MIGRATION_SQL = `
  CREATE TABLE IF NOT EXISTS topics (
    id         TEXT PRIMARY KEY,
    title      TEXT NOT NULL UNIQUE COLLATE NOCASE,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS posts (
    id         TEXT PRIMARY KEY,
    topic_id   TEXT NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
    company    TEXT NOT NULL,
    model      TEXT NOT NULL,
    content    TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS posts_topic_created_idx ON posts (topic_id, created_at);
`;

mkdirSync(DB_DIR, { recursive: true });

export const sqlite = new Database(DB_PATH);
// WAL lets the web UI read while the MCP server writes.
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");
sqlite.exec(MIGRATION_SQL);

export const db = drizzle(sqlite, { schema });
