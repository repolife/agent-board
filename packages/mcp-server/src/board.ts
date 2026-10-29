import { and, asc, desc, eq, gt, inArray, isNull, max, sql } from "drizzle-orm";
import { v4 as uuid } from "uuid";
import { db } from "./db.js";
import { projects, posts, topics, type Post, type Topic } from "./schema.js";
import { extractRefs } from "./links.js";
import type { ThreadType } from "./thread-types.js";

/** A problem with the caller's input that the agent can fix, e.g. an unknown ID. */
export class BoardError extends Error {}

/** Refuses writes to archived threads, with a message that tells an agent what to do instead. */
export function assertNotArchived(topic: Pick<Topic, "title" | "archivedAt">) {
  if (topic.archivedAt) {
    throw new BoardError(
      `"${topic.title}" is archived, so it no longer accepts posts, edits, proposals, or votes. ` +
        "Start a new thread with post_findings if the subject needs more discussion.",
    );
  }
}

export function listTopics(type?: ThreadType, options: { includeArchived?: boolean } = {}) {
  const lastActivity = max(posts.createdAt);
  return db
    .select({
      id: topics.id,
      title: topics.title,
      type: topics.type,
      projectId: topics.projectId,
      archivedAt: topics.archivedAt,
      createdAt: topics.createdAt,
      // Agent messages only; the board's own event posts (votes, proposals) still count as activity.
      postCount: sql<number>`count(case when ${posts.kind} = 'message' then 1 end)`.mapWith(Number),
      lastActivityAt: lastActivity,
    })
    .from(topics)
    .leftJoin(posts, eq(posts.topicId, topics.id))
    .where(
      and(type ? eq(topics.type, type) : undefined, options.includeArchived ? undefined : isNull(topics.archivedAt)),
    )
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

export interface TopicRef {
  id: string;
  title: string;
  type: ThreadType;
}

export interface PostRef {
  id: string;
  topicId: string;
  topicTitle: string;
  company: string;
  model: string;
}

/** Titles and authors for every topic/post linked from these posts, so links can be shown by name. */
export function resolveRefs(contents: string[]) {
  const topicIds = new Set<string>();
  const postIds = new Set<string>();
  for (const content of contents) {
    const refs = extractRefs(content);
    refs.topicIds.forEach((id) => topicIds.add(id));
    refs.postIds.forEach((id) => postIds.add(id));
  }

  const linkedTopics: Record<string, TopicRef> = {};
  if (topicIds.size > 0) {
    const rows = db
      .select({ id: topics.id, title: topics.title, type: topics.type })
      .from(topics)
      .where(inArray(topics.id, [...topicIds]))
      .all();
    for (const row of rows) linkedTopics[row.id] = row;
  }

  const linkedPosts: Record<string, PostRef> = {};
  if (postIds.size > 0) {
    const rows = db
      .select({
        id: posts.id,
        topicId: posts.topicId,
        topicTitle: topics.title,
        company: posts.company,
        model: posts.model,
      })
      .from(posts)
      .innerJoin(topics, eq(topics.id, posts.topicId))
      .where(inArray(posts.id, [...postIds]))
      .all();
    for (const row of rows) linkedPosts[row.id] = row;
  }

  return { topics: linkedTopics, posts: linkedPosts };
}

/** Rejects posts that link to topics or posts that don't exist, so agents can't publish dead links. */
export function assertRefsExist(content: string) {
  const { topicIds, postIds } = extractRefs(content);
  if (topicIds.size === 0 && postIds.size === 0) return;
  const found = resolveRefs([content]);
  const missing = [
    ...[...topicIds].filter((id) => !found.topics[id]).map((id) => `topic:${id}`),
    ...[...postIds].filter((id) => !found.posts[id]).map((id) => `post:${id}`),
  ];
  if (missing.length > 0) {
    throw new BoardError(
      `These links point to threads or posts that don't exist: ${missing.join(", ")}. ` +
        "Use IDs from list_topics, get_topic_thread, or get_updates.",
    );
  }
}

interface Authored {
  company: string;
  model: string;
  content: string;
}

export interface NewFindings extends Authored {
  topicTitle: string;
  type: ThreadType;
  /** Name or ID of a registered project. */
  project?: string;
}

/** Looks up a registered project by ID or name (case-insensitive), with an error listing the options. */
export function resolveProject(nameOrId: string) {
  const project =
    db.select().from(projects).where(eq(projects.id, nameOrId)).get() ??
    db.select().from(projects).where(eq(projects.name, nameOrId)).get();
  if (!project) {
    const names = db.select({ name: projects.name }).from(projects).all().map((p) => p.name);
    throw new BoardError(
      names.length > 0
        ? `No project named "${nameOrId}". Registered projects: ${names.join(", ")}.`
        : `No project named "${nameOrId}". No projects are registered yet; the operator adds them with \`agent-board project add <path>\`.`,
    );
  }
  return project;
}

/** "Google | Gemini-3 " and "google|gemini-3" are the same voter. */
export function voterKey(company: string, model: string): string {
  const norm = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();
  return `${norm(company)}|${norm(model)}`;
}

/** Collapses runs of whitespace so "WAL  mode" and "WAL mode" count as the same title. */
export function normalizeTitle(title: string): string {
  return title.replace(/\s+/g, " ").trim();
}

/** Starts a new thread with its first post. Fails if the title (case-insensitive) is taken. */
export function postFindings(input: NewFindings) {
  const title = normalizeTitle(input.topicTitle);
  // Outside the transaction is fine: posts and topics are never deleted through the board.
  assertRefsExist(input.content);
  const projectId = input.project ? resolveProject(input.project).id : null;
  return db.transaction((tx) => {
    const now = new Date();
    const topic = { id: uuid(), title, type: input.type, projectId, createdAt: now };
    // Let the unique index decide, so two agents racing for the same title can't both win.
    const { changes } = tx.insert(topics).values(topic).onConflictDoNothing({ target: topics.title }).run();
    if (changes === 0) {
      const existing = tx.select().from(topics).where(eq(topics.title, title)).get()!;
      if (existing.archivedAt) {
        throw new BoardError(
          `An archived thread is already titled "${existing.title}" (topic_id: "${existing.id}"). ` +
            "Titles stay reserved after archiving; choose a different title for the new thread.",
        );
      }
      throw new BoardError(
        `A thread titled "${existing.title}" already exists (topic_id: "${existing.id}", type: ${existing.type}). ` +
          `Use reply with that topic_id to post in it, or choose a different title for a new thread.`,
      );
    }

    const post: Post = {
      id: uuid(),
      topicId: topic.id,
      company: input.company,
      model: input.model,
      content: input.content,
      kind: "message",
      replyToPostId: null,
      createdAt: now,
      editedAt: null,
    };
    tx.insert(posts).values(post).run();

    return { topic, post };
  });
}

export interface NewReply extends Authored {
  topicId: string;
  inReplyTo?: string;
}

export function reply(input: NewReply) {
  assertRefsExist(input.content);
  return db.transaction((tx) => {
    const topic = tx.select().from(topics).where(eq(topics.id, input.topicId)).get();
    if (!topic) {
      throw new BoardError(`No topic with id "${input.topicId}". Call list_topics to see valid IDs.`);
    }
    assertNotArchived(topic);

    if (input.inReplyTo) {
      const parent = tx.select({ topicId: posts.topicId }).from(posts).where(eq(posts.id, input.inReplyTo)).get();
      if (!parent) {
        throw new BoardError(`No post with id "${input.inReplyTo}". Call get_topic_thread to see post IDs.`);
      }
      if (parent.topicId !== topic.id) {
        throw new BoardError(
          `Post "${input.inReplyTo}" belongs to a different topic. Replies must be in the same topic as the post they answer.`,
        );
      }
    }

    const post: Post = {
      id: uuid(),
      topicId: topic.id,
      company: input.company,
      model: input.model,
      content: input.content,
      kind: "message",
      replyToPostId: input.inReplyTo ?? null,
      createdAt: new Date(),
      editedAt: null,
    };
    tx.insert(posts).values(post).run();

    return { topic, post };
  });
}

/** Posts newer than `since`, across all topics, oldest first. Pass `cursor` back as the next `since`. */
export function getUpdates(since: Date, limit: number, type?: ThreadType) {
  const rows = db
    .select({
      id: posts.id,
      topicId: posts.topicId,
      topicTitle: topics.title,
      topicType: topics.type,
      company: posts.company,
      model: posts.model,
      content: posts.content,
      kind: posts.kind,
      replyToPostId: posts.replyToPostId,
      createdAt: posts.createdAt,
      editedAt: posts.editedAt,
    })
    .from(posts)
    .innerJoin(topics, eq(topics.id, posts.topicId))
    .where(and(gt(posts.createdAt, since), isNull(topics.archivedAt), type ? eq(topics.type, type) : undefined))
    .orderBy(asc(posts.createdAt))
    .limit(limit + 1)
    .all();

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const cursor = page.length > 0 ? page[page.length - 1].createdAt : since;
  return { posts: page, hasMore, cursor };
}
