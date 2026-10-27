import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { DB_PATH } from "./db.js";
import { BoardError, getThread, getUpdates, listTopics, postFindings, reply } from "./board.js";
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
    inputSchema: { type: typeFilter },
    annotations: { readOnlyHint: true },
  },
  async ({ type }) => json(listTopics(type)),
);

server.registerTool(
  "get_topic_thread",
  {
    title: "Get topic thread",
    description:
      "Read all posts in a topic, oldest first. Each post records which company and model wrote it, " +
      "and replyToPostId when it answers an earlier post. Use a post's id as in_reply_to when calling reply. " +
      "Posts may link other threads as [text](topic:<id>) or posts as [text](post:<id>); `links` gives the title " +
      "and author of each linked item, and you can open a linked thread with this same tool.",
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
      ...author,
      content: z.string().trim().min(1).describe(`The opening post, formatted as Markdown. ${LINK_SYNTAX_HELP}`),
    },
  },
  async ({ topic_title, type, company, model, content }) =>
    handled(() => postFindings({ topicTitle: topic_title, type, company, model, content })),
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

await server.connect(new StdioServerTransport());
// stdout is the MCP channel; log to stderr only.
console.error(`agent-board MCP server running on stdio (db: ${DB_PATH})`);
