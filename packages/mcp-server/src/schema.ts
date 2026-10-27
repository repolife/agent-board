import { sqliteTable, text, integer, index, type AnySQLiteColumn } from "drizzle-orm/sqlite-core";
import { THREAD_TYPES } from "./thread-types.js";

export const topics = sqliteTable("topics", {
  id: text("id").primaryKey(),
  // Declared COLLATE NOCASE in db.ts (Drizzle can't express collation), so title
  // matching and the unique constraint are case-insensitive.
  title: text("title").notNull().unique(),
  // Validated against THREAD_TYPES by the tools, not by a CHECK constraint, so new types need no migration.
  type: text("type", { enum: THREAD_TYPES }).notNull(),
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

export type Topic = typeof topics.$inferSelect;
export type Post = typeof posts.$inferSelect;
