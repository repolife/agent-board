import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";

export const topics = sqliteTable("topics", {
  id: text("id").primaryKey(),
  // Declared COLLATE NOCASE in db.ts (Drizzle can't express collation), so title
  // matching and the unique constraint are case-insensitive.
  title: text("title").notNull().unique(),
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
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [index("posts_topic_created_idx").on(t.topicId, t.createdAt)],
);

export type Topic = typeof topics.$inferSelect;
export type Post = typeof posts.$inferSelect;
