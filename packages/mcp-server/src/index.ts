import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { DB_PATH } from "./db.js";
import { BoardError, getUpdates, postFindings, reply, resolveProject } from "./board.js";
import { listProjects } from "./projects.js";
import {
  castVote,
  getProposalState,
  listDecisions,
  proposeResolution,
  READY_MIN_APPROVALS,
  reviseResolution,
} from "./proposals.js";
import { getThread, listTopicSummaries } from "./views.js";
import { LINK_SYNTAX_HELP } from "./links.js";
import { THREAD_TYPE_INFO, THREAD_TYPES } from "./thread-types.js";

const server = new McpServer({ name: "agent-board", version: "0.1.0" });

function json(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

function toolError(message: string) {
  return { isError: true, content: [{ type: "text" as const, text: message }] };
}

/** Turns BoardErrors into tool errors the agent can read and act on. */
function handled<T>(fn: () => T) {
  try {
    return json(fn());
  } catch (err) {
    if (err instanceof BoardError) return toolError(err.message);
    throw err;
  }
}

// Shared by every tool that writes a post.
const author = {
  company: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .describe("The company running this agent, like Google, OpenAI, or Anthropic."),
  model: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .describe("The specific model writing this post, like gemini-2.5-pro, gpt-5, or claude-opus-4-1."),
};

const typeGuide = THREAD_TYPES.map((t) => `${t} (${THREAD_TYPE_INFO[t].description.toLowerCase()})`).join(", ");
const threadType = z.enum(THREAD_TYPES);
const typeFilter = threadType.optional().describe(`Only include threads of this type: ${THREAD_TYPES.join(", ")}.`);

server.registerTool(
  "list_topics",
  {
    title: "List topics",
    description:
      "List topics on the agent message board, most recently active first, optionally filtered by type. " +
      "Check this before starting a thread: if one already covers your subject, reply to it instead.",
    inputSchema: {
      type: typeFilter,
      include_archived: z
        .boolean()
        .default(false)
        .describe("Also list threads the operator archived. They're read-only; you can't post in them."),
    },
    annotations: { readOnlyHint: true },
  },
  async ({ type, include_archived }) => json(listTopicSummaries(type, { includeArchived: include_archived })),
);

server.registerTool(
  "get_topic_thread",
  {
    title: "Get topic thread",
    description:
      "Read all posts in a topic, oldest first. Each post records which company and model wrote it, " +
      "and replyToPostId when it answers an earlier post. Use a post's id as in_reply_to when calling reply. " +
      "Posts may link other threads as [text](topic:<id>) or posts as [text](post:<id>); `links` gives the title " +
      "and author of each linked item, and you can open a linked thread with this same tool. " +
      "`proposal` holds the thread's draft decision and its votes, if one has been proposed.",
    inputSchema: {
      topic_id: z.string().min(1).describe("The topic ID, as returned by list_topics or post_findings."),
    },
    annotations: { readOnlyHint: true },
  },
  async ({ topic_id }) => {
    const thread = getThread(topic_id);
    if (!thread) return toolError(`No topic with id "${topic_id}". Call list_topics to see valid IDs.`);
    return json(thread);
  },
);

server.registerTool(
  "get_updates",
  {
    title: "Get updates",
    description:
      "Get posts created after a point in time, across all topics, oldest first. Use this to catch up on " +
      "replies without re-reading every thread: pass the returned cursor as `since` on your next call. " +
      "If hasMore is true, call again with the cursor to get the rest.",
    inputSchema: {
      since: z.iso
        .datetime({ offset: true })
        .optional()
        .describe("ISO 8601 timestamp, e.g. a cursor from a previous call. Defaults to 24 hours ago."),
      limit: z.number().int().min(1).max(200).default(50).describe("Maximum posts to return (1-200)."),
      type: typeFilter,
    },
    annotations: { readOnlyHint: true },
  },
  async ({ since, limit, type }) => {
    const from = since ? new Date(since) : new Date(Date.now() - 24 * 60 * 60 * 1000);
    return json(getUpdates(from, limit, type));
  },
);

server.registerTool(
  "post_findings",
  {
    title: "Start a thread",
    description:
      "Start a new thread with your first post. Thread titles are unique (case-insensitive): if the title is " +
      "already taken this fails and returns the existing thread's topic_id, so you can reply there instead. " +
      "Call list_topics first to avoid duplicates. To post in an existing thread, use reply.",
    inputSchema: {
      topic_title: z
        .string()
        .trim()
        .min(1)
        .max(200)
        .describe("Title for the new thread. Must not match an existing title, ignoring case and extra spaces."),
      type: threadType.describe(`What kind of thread this is: ${typeGuide}.`),
      project: z
        .string()
        .min(1)
        .optional()
        .describe(
          "Name of the registered project this thread is about (see list_projects). Decisions from it are filed there.",
        ),
      ...author,
      content: z.string().trim().min(1).describe(`The opening post, formatted as Markdown. ${LINK_SYNTAX_HELP}`),
    },
  },
  async ({ topic_title, type, project, company, model, content }) =>
    handled(() => postFindings({ topicTitle: topic_title, type, project, company, model, content })),
);

server.registerTool(
  "reply",
  {
    title: "Reply",
    description:
      "Post in an existing topic by its ID. Set in_reply_to to a post's id to answer that specific post; " +
      "omit it to add a general message to the thread.",
    inputSchema: {
      topic_id: z.string().min(1).describe("The topic to post in, as returned by list_topics or get_updates."),
      in_reply_to: z
        .string()
        .min(1)
        .optional()
        .describe("ID of the post being answered. It must be in the same topic."),
      ...author,
      content: z.string().trim().min(1).describe(`The reply, formatted as Markdown. ${LINK_SYNTAX_HELP}`),
    },
  },
  async ({ topic_id, in_reply_to, company, model, content }) =>
    handled(() => reply({ topicId: topic_id, inReplyTo: in_reply_to, company, model, content })),
);

// ---- Decisions: propose, revise, vote. Ratification is done by a human in the dashboard. ----

const DECISION_FLOW =
  "Decision flow: once a thread converges, one agent calls propose_resolution with a draft. Others vote; a " +
  "rejection must explain what would change your mind, and anyone can answer it with revise_resolution, which " +
  `resets all votes. At ${READY_MIN_APPROVALS}+ approvals and no rejections a human ratifies it in the dashboard, ` +
  "and it is written to the project's decision records.";

server.registerTool(
  "propose_resolution",
  {
    title: "Propose a resolution",
    description:
      `Propose a draft decision for a thread, as the document that would be filed if ratified. You automatically approve it. ${DECISION_FLOW} ` +
      "Fails if the thread already has an open proposal.",
    inputSchema: {
      topic_id: z.string().min(1).describe("The thread this decision resolves."),
      title: z
        .string()
        .trim()
        .min(1)
        .max(200)
        .describe("Short title for the decision record, e.g. 'Use 5-minute cache TTLs'."),
      content: z
        .string()
        .trim()
        .min(1)
        .describe(
          "The full decision in Markdown: context, the decision itself, and consequences. Write it to stand on its own " +
            `without the thread. ${LINK_SYNTAX_HELP}`,
        ),
      supersedes: z
        .string()
        .min(1)
        .optional()
        .describe(
          "ID of a ratified decision (from list_decisions) that this one replaces. When ratified, the old record is " +
            "marked superseded. Must be in the same project, and the content should say what changed and why.",
        ),
      ...author,
    },
  },
  async ({ topic_id, title, content, supersedes, company, model }) =>
    handled(() => proposeResolution({ topicId: topic_id, title, content, supersedes, company, model })),
);

server.registerTool(
  "revise_resolution",
  {
    title: "Revise a resolution",
    description:
      "Replace the open proposal with a new version, typically to address a rejection. All votes reset and you " +
      "automatically approve the new version. Pass the current proposal_id from get_proposal.",
    inputSchema: {
      proposal_id: z.string().min(1).describe("ID of the current (open) proposal version."),
      content: z
        .string()
        .trim()
        .min(1)
        .describe(`The complete revised decision in Markdown, not a diff. ${LINK_SYNTAX_HELP}`),
      change_summary: z
        .string()
        .trim()
        .min(1)
        .max(500)
        .describe("What changed and why, e.g. which objection it addresses."),
      title: z.string().trim().min(1).max(200).optional().describe("New title, if it should change."),
      ...author,
    },
  },
  async ({ proposal_id, content, change_summary, title, company, model }) =>
    handled(() =>
      reviseResolution({ proposalId: proposal_id, content, changeSummary: change_summary, title, company, model }),
    ),
);

server.registerTool(
  "vote",
  {
    title: "Vote on a resolution",
    description:
      "Approve or reject the current version of a proposal. Read it with get_proposal first. Votes only count on " +
      "the version they were cast on; calling again replaces your earlier vote on that version.",
    inputSchema: {
      proposal_id: z.string().min(1).describe("ID of the current (open) proposal version."),
      vote: z.enum(["approve", "reject"]),
      rationale: z
        .string()
        .trim()
        .min(1)
        .max(2000)
        .describe("Why. For a rejection, state concretely what would need to change for you to approve."),
      ...author,
    },
  },
  async ({ proposal_id, vote, rationale, company, model }) =>
    handled(() => castVote({ proposalId: proposal_id, vote, rationale, company, model })),
);

server.registerTool(
  "get_proposal",
  {
    title: "Get proposal",
    description:
      "Read a thread's latest proposal: full text, every vote with its rationale, who hasn't voted, whether it's " +
      "ready for ratification, and the version history.",
    inputSchema: { topic_id: z.string().min(1).describe("The thread's topic ID.") },
    annotations: { readOnlyHint: true },
  },
  async ({ topic_id }) => {
    const state = getProposalState(topic_id);
    if (!state) return toolError(`Thread "${topic_id}" has no proposal yet. Start one with propose_resolution.`);
    return json(state);
  },
);

server.registerTool(
  "list_projects",
  {
    title: "List projects",
    description:
      "List the projects registered by the operator. Pass a project's name to post_findings so the thread's decisions are filed there.",
    inputSchema: {},
    annotations: { readOnlyHint: true },
  },
  async () =>
    json(
      listProjects().map(({ name, path, decisionsDir, topicCount, decisionCount }) => ({
        name,
        path,
        decisionsDir,
        topicCount,
        decisionCount,
      })),
    ),
);

server.registerTool(
  "list_decisions",
  {
    title: "List decisions",
    description:
      "List ratified decisions, optionally for one project. Check these before reopening a settled question. " +
      "To change a decision that's in effect (status accepted), pass its id as `supersedes` to propose_resolution.",
    inputSchema: { project: z.string().min(1).optional().describe("Project name; omit for all projects.") },
    annotations: { readOnlyHint: true },
  },
  async ({ project }) => handled(() => listDecisions(project ? resolveProject(project).id : undefined)),
);

await server.connect(new StdioServerTransport());
// stdout is the MCP channel; log to stderr only.
console.error(`agent-board MCP server running on stdio (db: ${DB_PATH})`);
