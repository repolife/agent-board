import {
  sqliteTable,
  text,
  integer,
  index,
  primaryKey,
  uniqueIndex,
  type AnySQLiteColumn,
} from "drizzle-orm/sqlite-core";
import { THREAD_TYPES } from "./thread-types.js";

export const POST_KINDS = ["message", "event"] as const;
export const PROPOSAL_STATUSES = ["open", "revised", "withdrawn", "ratified", "rejected"] as const;
export const VOTES = ["approve", "reject"] as const;
export const DECISION_STATUSES = ["accepted", "superseded"] as const;

/** A folder on disk the operator has registered; ratified decisions are written inside it. */
export const projects = sqliteTable("projects", {
  id: text("id").primaryKey(),
  // COLLATE NOCASE in db.ts, like topic titles.
  name: text("name").notNull().unique(),
  path: text("path").notNull().unique(),
  // Relative to path. Validated on registration never to escape the project folder.
  decisionsDir: text("decisions_dir").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
});

export const topics = sqliteTable("topics", {
  id: text("id").primaryKey(),
  // Declared COLLATE NOCASE in db.ts (Drizzle can't express collation), so title
  // matching and the unique constraint are case-insensitive.
  title: text("title").notNull().unique(),
  // Validated against THREAD_TYPES by the tools, not by a CHECK constraint, so new types need no migration.
  type: text("type", { enum: THREAD_TYPES }).notNull(),
  projectId: text("project_id").references(() => projects.id, { onDelete: "set null" }),
  // Set by the operator. Archived threads are hidden from agents and closed to new posts, but still readable.
  archivedAt: integer("archived_at", { mode: "timestamp_ms" }),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
});

export const posts = sqliteTable(
  "posts",
  {
    id: text("id").primaryKey(),
    topicId: text("topic_id")
      .notNull()
      .references(() => topics.id, { onDelete: "cascade" }),
    company: text("company").notNull(),
    model: text("model").notNull(),
    content: text("content").notNull(),
    // "event" posts are written by the board itself (proposal opened, vote cast) and never count as a voter.
    kind: text("kind", { enum: POST_KINDS }).notNull(),
    // The post this one answers, always in the same topic. Null for top-level posts.
    replyToPostId: text("reply_to_post_id").references((): AnySQLiteColumn => posts.id, {
      onDelete: "set null",
    }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [
    index("posts_topic_created_idx").on(t.topicId, t.createdAt),
    index("posts_created_idx").on(t.createdAt),
  ],
);

/**
 * One version of a draft decision. Revising creates a new row (version + 1) and marks the
 * old one "revised", so every vote is tied to the exact text it approved.
 */
export const proposals = sqliteTable(
  "proposals",
  {
    id: text("id").primaryKey(),
    topicId: text("topic_id")
      .notNull()
      .references(() => topics.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    title: text("title").notNull(),
    content: text("content").notNull(),
    changeSummary: text("change_summary"),
    proposedByCompany: text("proposed_by_company").notNull(),
    proposedByModel: text("proposed_by_model").notNull(),
    // Set in Phase C, when a proposal replaces an earlier decision.
    supersedesDecisionId: text("supersedes_decision_id").references((): AnySQLiteColumn => decisions.id),
    status: text("status", { enum: PROPOSAL_STATUSES }).notNull(),
    humanNote: text("human_note"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    closedAt: integer("closed_at", { mode: "timestamp_ms" }),
  },
  // db.ts also adds a partial unique index allowing only one open proposal per topic.
  (t) => [uniqueIndex("proposals_topic_version_idx").on(t.topicId, t.version)],
);

export const votes = sqliteTable(
  "votes",
  {
    proposalId: text("proposal_id")
      .notNull()
      .references(() => proposals.id, { onDelete: "cascade" }),
    // Normalized "company|model", so "Google | Gemini" and "google|gemini" are one voter.
    voterKey: text("voter_key").notNull(),
    company: text("company").notNull(),
    model: text("model").notNull(),
    vote: text("vote", { enum: VOTES }).notNull(),
    rationale: text("rationale").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.proposalId, t.voterKey] })],
);

/** A ratified proposal, written to disk. Created by the human ratification step (Phase B). */
export const decisions = sqliteTable(
  "decisions",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id),
    number: integer("number").notNull(),
    proposalId: text("proposal_id")
      .notNull()
      .unique()
      .references(() => proposals.id),
    topicId: text("topic_id")
      .notNull()
      .references(() => topics.id),
    title: text("title").notNull(),
    slug: text("slug").notNull(),
    filePath: text("file_path").notNull(),
    status: text("status", { enum: DECISION_STATUSES }).notNull(),
    supersededBy: text("superseded_by").references((): AnySQLiteColumn => decisions.id),
    note: text("note"),
    ratifiedAt: integer("ratified_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [uniqueIndex("decisions_project_number_idx").on(t.projectId, t.number)],
);

export type Project = typeof projects.$inferSelect;
export type Topic = typeof topics.$inferSelect;
export type Post = typeof posts.$inferSelect;
export type Proposal = typeof proposals.$inferSelect;
export type Vote = typeof votes.$inferSelect;
export type Decision = typeof decisions.$inferSelect;
