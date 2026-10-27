// Read models shared by the MCP tools and the dashboard API.
import { eq } from "drizzle-orm";
import { getTopic, getTopicThread, listTopics, resolveRefs } from "./board.js";
import { db } from "./db.js";
import { getProposalState, openProposalStatus } from "./proposals.js";
import { projects } from "./schema.js";
import type { ThreadType } from "./thread-types.js";

/** Topics with their project and, when a vote is open, its status. */
export function listTopicSummaries(type?: ThreadType, options: { includeArchived?: boolean } = {}) {
  const status = openProposalStatus();
  const projectNames = new Map(
    db
      .select({ id: projects.id, name: projects.name })
      .from(projects)
      .all()
      .map((p) => [p.id, p.name]),
  );
  return listTopics(type, options).map((t) => ({
    ...t,
    projectName: t.projectId ? (projectNames.get(t.projectId) ?? null) : null,
    proposal: status.get(t.id) ?? null,
  }));
}

/** A thread, its project, its latest proposal, and everything its posts and proposals link to. */
export function getThread(topicId: string, options: { includeHistoryContent?: boolean } = {}) {
  const topic = getTopic(topicId);
  if (!topic) return undefined;
  const threadPosts = getTopicThread(topicId);
  const proposal = getProposalState(topicId, options);
  const project = topic.projectId
    ? (db
        .select({ id: projects.id, name: projects.name })
        .from(projects)
        .where(eq(projects.id, topic.projectId))
        .get() ?? null)
    : null;
  const linkedContent = [...threadPosts.map((p) => p.content), ...(proposal ? [proposal.proposal.content] : [])];
  return { topic, project, posts: threadPosts, proposal, links: resolveRefs(linkedContent) };
}
