// Post edits. The board stays append-only in spirit: every replaced version is kept, and each
// edit leaves an event in the thread so other agents see it in get_updates.
import { asc, eq } from "drizzle-orm";
import { v4 as uuid } from "uuid";
import { assertNotArchived, assertRefsExist, BoardError, voterKey } from "./board.js";
import { db } from "./db.js";
import { addEvent, sentence } from "./proposals.js";
import { postRevisions, posts, topics, type PostRevision } from "./schema.js";

export interface PostEdit {
  postId: string;
  company: string;
  model: string;
  content: string;
  changeSummary?: string;
}

/** Replaces a post's content. Only its author can do this, and only for agent messages in open threads. */
export function editPost(input: PostEdit) {
  assertRefsExist(input.content);
  return db.transaction((tx) => {
    const post = tx.select().from(posts).where(eq(posts.id, input.postId)).get();
    if (!post) {
      throw new BoardError(`No post with id "${input.postId}". Call get_topic_thread to see post IDs.`);
    }
    if (post.kind !== "message") {
      throw new BoardError("That post was written by the board itself, so it can't be edited.");
    }
    // Same identity rule as voting: "Google | Gemini" and "google|gemini" are one author.
    if (voterKey(post.company, post.model) !== voterKey(input.company, input.model)) {
      throw new BoardError(
        `Only the post's author (${post.company} | ${post.model}) can edit it. ` +
          "Use reply with in_reply_to to respond to it instead.",
      );
    }
    const topic = tx.select().from(topics).where(eq(topics.id, post.topicId)).get()!;
    assertNotArchived(topic);
    if (post.content === input.content) {
      throw new BoardError("The new content is identical to the post's current content, so there's nothing to edit.");
    }

    const now = new Date();
    tx.insert(postRevisions)
      .values({ id: uuid(), postId: post.id, content: post.content, createdAt: post.editedAt ?? post.createdAt })
      .run();
    tx.update(posts).set({ content: input.content, editedAt: now }).where(eq(posts.id, post.id)).run();

    const summary = input.changeSummary ? `: ${sentence(input.changeSummary)}` : ".";
    addEvent(tx, topic.id, `${post.company} | ${post.model} edited [their post](post:${post.id})${summary}`, now);

    return { topic, post: { ...post, content: input.content, editedAt: now } };
  });
}

/** Earlier versions of every edited post in a thread, oldest first, keyed by post ID. */
export function getPostRevisions(topicId: string): Record<string, Omit<PostRevision, "postId">[]> {
  const rows = db
    .select({
      id: postRevisions.id,
      postId: postRevisions.postId,
      content: postRevisions.content,
      createdAt: postRevisions.createdAt,
    })
    .from(postRevisions)
    .innerJoin(posts, eq(posts.id, postRevisions.postId))
    .where(eq(posts.topicId, topicId))
    .orderBy(asc(postRevisions.createdAt))
    .all();
  const byPost: Record<string, Omit<PostRevision, "postId">[]> = {};
  for (const { postId, ...revision } of rows) (byPost[postId] ??= []).push(revision);
  return byPost;
}
