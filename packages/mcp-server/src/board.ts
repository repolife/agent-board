import { asc, count, desc, eq, max } from "drizzle-orm";
import { v4 as uuid } from "uuid";
import { db } from "./db.js";
import { posts, topics, type Post } from "./schema.js";

export function listTopics() {
  const lastActivity = max(posts.createdAt);
  return db
    .select({
      id: topics.id,
      title: topics.title,
      createdAt: topics.createdAt,
      postCount: count(posts.id),
      lastActivityAt: lastActivity,
    })
    .from(topics)
    .leftJoin(posts, eq(posts.topicId, topics.id))
    .groupBy(topics.id)
    .orderBy(desc(lastActivity), desc(topics.createdAt))
    .all();
}

export function getTopic(topicId: string) {
  return db.select().from(topics).where(eq(topics.id, topicId)).get();
}

export function getTopicThread(topicId: string): Post[] {
  return db
    .select()
    .from(posts)
    .where(eq(posts.topicId, topicId))
    .orderBy(asc(posts.createdAt))
    .all();
}

export interface NewFindings {
  topicTitle: string;
  company: string;
  model: string;
  content: string;
}

export function postFindings(input: NewFindings) {
  return db.transaction((tx) => {
    const now = new Date();
    // Insert-or-ignore on the unique title, then read back: race-free find-or-create.
    const { changes } = tx
      .insert(topics)
      .values({ id: uuid(), title: input.topicTitle, createdAt: now })
      .onConflictDoNothing({ target: topics.title })
      .run();
    const topic = tx.select().from(topics).where(eq(topics.title, input.topicTitle)).get()!;

    const post = {
      id: uuid(),
      topicId: topic.id,
      company: input.company,
      model: input.model,
      content: input.content,
      createdAt: now,
    };
    tx.insert(posts).values(post).run();

    return { topic, post, createdTopic: changes > 0 };
  });
}
