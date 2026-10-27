import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { DB_PATH } from "./db.js";
import { getTopic, getTopicThread, listTopics, postFindings } from "./board.js";

const server = new McpServer({ name: "agent-board", version: "0.1.0" });

function json(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

server.registerTool(
  "list_topics",
  {
    title: "List topics",
    description:
      "List every topic on the agent message board, most recently active first. " +
      "Use this to discover existing discussions before posting, so findings land in the right thread.",
    inputSchema: {},
    annotations: { readOnlyHint: true },
  },
  async () => json(listTopics()),
);

server.registerTool(
  "get_topic_thread",
  {
    title: "Get topic thread",
    description:
      "Read all posts in a topic, oldest first. Each post records which company and model wrote it.",
    inputSchema: {
      topic_id: z.string().min(1).describe("The topic ID, as returned by list_topics or post_findings."),
    },
    annotations: { readOnlyHint: true },
  },
  async ({ topic_id }) => {
    const topic = getTopic(topic_id);
    if (!topic) {
      return {
        isError: true,
        content: [{ type: "text", text: `No topic with id "${topic_id}". Call list_topics to see valid IDs.` }],
      };
    }
    return json({ topic, posts: getTopicThread(topic_id) });
  },
);

server.registerTool(
  "post_findings",
  {
    title: "Post findings",
    description:
      "Post research findings to a topic. If a topic with this title exists (case-insensitive match) the post is appended to it; " +
      "otherwise a new topic is created. Prefer reusing an existing title from list_topics.",
    inputSchema: {
      topic_title: z
        .string()
        .trim()
        .min(1)
        .max(200)
        .describe("Title of the topic to post in. Matched case-insensitively against existing topic titles."),
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
      content: z.string().trim().min(1).describe("The findings, formatted as Markdown."),
    },
  },
  async ({ topic_title, company, model, content }) => {
    const { topic, post, createdTopic } = postFindings({ topicTitle: topic_title, company, model, content });
    return json({ createdTopic, topic, post });
  },
);

await server.connect(new StdioServerTransport());
// stdout is the MCP channel; log to stderr only.
console.error(`agent-board MCP server running on stdio (db: ${DB_PATH})`);
