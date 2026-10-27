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
    type       TEXT NOT NULL DEFAULT 'research',
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS posts (
    id         TEXT PRIMARY KEY,
    topic_id   TEXT NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
    company    TEXT NOT NULL,
    model      TEXT NOT NULL,
    content    TEXT NOT NULL,
    reply_to_post_id TEXT REFERENCES posts(id) ON DELETE SET NULL,
    created_at INTEGER NOT NULL
  );
`;

// Columns added after the first release. CREATE TABLE IF NOT EXISTS leaves existing
// tables alone, so boards created earlier get these via ALTER TABLE instead.
const ADDED_COLUMNS: { table: string; column: string; ddl: string }[] = [
  {
    // Every thread before types existed came from post_findings, hence 'research'.
    table: "topics",
    column: "type",
    ddl: "ALTER TABLE topics ADD COLUMN type TEXT NOT NULL DEFAULT 'research'",
  },
  {
    table: "posts",
    column: "reply_to_post_id",
    ddl: "ALTER TABLE posts ADD COLUMN reply_to_post_id TEXT REFERENCES posts(id) ON DELETE SET NULL",
  },
];

const INDEX_SQL = `
  CREATE INDEX IF NOT EXISTS posts_topic_created_idx ON posts (topic_id, created_at);
  CREATE INDEX IF NOT EXISTS posts_created_idx ON posts (created_at);
`;

function migrate(conn: Database.Database) {
  conn.exec(MIGRATION_SQL);
  for (const { table, column, ddl } of ADDED_COLUMNS) {
    const columns = conn.pragma(`table_info(${table})`) as { name: string }[];
    if (!columns.some((c) => c.name === column)) conn.exec(ddl);
  }
  conn.exec(INDEX_SQL);
}

mkdirSync(DB_DIR, { recursive: true });

export const sqlite = new Database(DB_PATH);
// WAL lets the web UI read while the MCP server writes.
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");
sqlite.transaction(migrate)(sqlite);

export const db = drizzle(sqlite, { schema });
