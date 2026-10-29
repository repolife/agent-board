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
  CREATE TABLE IF NOT EXISTS projects (
    id            TEXT PRIMARY KEY,
    name          TEXT NOT NULL UNIQUE COLLATE NOCASE,
    path          TEXT NOT NULL UNIQUE,
    decisions_dir TEXT NOT NULL,
    created_at    INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS topics (
    id         TEXT PRIMARY KEY,
    title      TEXT NOT NULL UNIQUE COLLATE NOCASE,
    type       TEXT NOT NULL DEFAULT 'research',
    project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
    archived_at INTEGER,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS posts (
    id         TEXT PRIMARY KEY,
    topic_id   TEXT NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
    company    TEXT NOT NULL,
    model      TEXT NOT NULL,
    content    TEXT NOT NULL,
    kind       TEXT NOT NULL DEFAULT 'message',
    reply_to_post_id TEXT REFERENCES posts(id) ON DELETE SET NULL,
    created_at INTEGER NOT NULL,
    edited_at  INTEGER
  );

  CREATE TABLE IF NOT EXISTS post_revisions (
    id         TEXT PRIMARY KEY,
    post_id    TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    content    TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS decisions (
    id            TEXT PRIMARY KEY,
    project_id    TEXT NOT NULL REFERENCES projects(id),
    number        INTEGER NOT NULL,
    proposal_id   TEXT NOT NULL UNIQUE REFERENCES proposals(id),
    topic_id      TEXT NOT NULL REFERENCES topics(id),
    title         TEXT NOT NULL,
    slug          TEXT NOT NULL,
    file_path     TEXT NOT NULL,
    status        TEXT NOT NULL,
    superseded_by TEXT REFERENCES decisions(id),
    note          TEXT,
    ratified_at   INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS proposals (
    id                     TEXT PRIMARY KEY,
    topic_id               TEXT NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
    version                INTEGER NOT NULL,
    title                  TEXT NOT NULL,
    content                TEXT NOT NULL,
    change_summary         TEXT,
    proposed_by_company    TEXT NOT NULL,
    proposed_by_model      TEXT NOT NULL,
    supersedes_decision_id TEXT REFERENCES decisions(id),
    status                 TEXT NOT NULL,
    human_note             TEXT,
    created_at             INTEGER NOT NULL,
    closed_at              INTEGER
  );

  CREATE TABLE IF NOT EXISTS votes (
    proposal_id TEXT NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
    voter_key   TEXT NOT NULL,
    company     TEXT NOT NULL,
    model       TEXT NOT NULL,
    vote        TEXT NOT NULL,
    rationale   TEXT NOT NULL,
    created_at  INTEGER NOT NULL,
    updated_at  INTEGER NOT NULL,
    PRIMARY KEY (proposal_id, voter_key)
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
  {
    table: "topics",
    column: "project_id",
    ddl: "ALTER TABLE topics ADD COLUMN project_id TEXT REFERENCES projects(id) ON DELETE SET NULL",
  },
  {
    table: "posts",
    column: "kind",
    ddl: "ALTER TABLE posts ADD COLUMN kind TEXT NOT NULL DEFAULT 'message'",
  },
  {
    table: "topics",
    column: "archived_at",
    ddl: "ALTER TABLE topics ADD COLUMN archived_at INTEGER",
  },
  {
    table: "posts",
    column: "edited_at",
    ddl: "ALTER TABLE posts ADD COLUMN edited_at INTEGER",
  },
];

const INDEX_SQL = `
  CREATE INDEX IF NOT EXISTS posts_topic_created_idx ON posts (topic_id, created_at);
  CREATE INDEX IF NOT EXISTS posts_created_idx ON posts (created_at);
  CREATE INDEX IF NOT EXISTS post_revisions_post_idx ON post_revisions (post_id, created_at);
  CREATE UNIQUE INDEX IF NOT EXISTS proposals_topic_version_idx ON proposals (topic_id, version);
  -- At most one open proposal per thread, enforced even if two agents propose at once.
  CREATE UNIQUE INDEX IF NOT EXISTS proposals_one_open_idx ON proposals (topic_id) WHERE status = 'open';
  CREATE UNIQUE INDEX IF NOT EXISTS decisions_project_number_idx ON decisions (project_id, number);
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
