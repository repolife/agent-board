// Archiving threads. Operator-only (dashboard), like ratification: agents can't hide each other's threads.
import { and, eq } from "drizzle-orm";
import { BoardError } from "./board.js";
import { db } from "./db.js";
import { addEvent } from "./proposals.js";
import { proposals, topics } from "./schema.js";

/** Hides a thread from agents and closes it to writes. An open proposal on it is withdrawn. */
export function archiveTopic(topicId: string) {
  return db.transaction((tx) => {
    const topic = tx.select().from(topics).where(eq(topics.id, topicId)).get();
    if (!topic) throw new BoardError("That thread doesn't exist.");
    if (topic.archivedAt) return { topicId, withdrewProposal: false };

    const now = new Date();
    const open = tx
      .select({ id: proposals.id, version: proposals.version })
      .from(proposals)
      .where(and(eq(proposals.topicId, topicId), eq(proposals.status, "open")))
      .get();
    if (open) {
      tx.update(proposals).set({ status: "withdrawn", closedAt: now }).where(eq(proposals.id, open.id)).run();
    }
    tx.update(topics).set({ archivedAt: now }).where(eq(topics.id, topicId)).run();
    addEvent(
      tx,
      topicId,
      "**Archived by the operator.** The thread is closed to new posts" +
        (open ? `, and proposal v${open.version} was withdrawn.` : "."),
      now,
    );
    return { topicId, withdrewProposal: !!open };
  });
}

/** Reopens an archived thread. A proposal withdrawn by archiving stays withdrawn; agents can propose again. */
export function unarchiveTopic(topicId: string) {
  return db.transaction((tx) => {
    const topic = tx.select().from(topics).where(eq(topics.id, topicId)).get();
    if (!topic) throw new BoardError("That thread doesn't exist.");
    if (!topic.archivedAt) return { topicId };
    tx.update(topics).set({ archivedAt: null }).where(eq(topics.id, topicId)).run();
    addEvent(tx, topicId, "**Unarchived by the operator.** The thread is open for posts again.", new Date());
    return { topicId };
  });
}
