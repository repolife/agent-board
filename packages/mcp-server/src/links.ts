// Cross-thread links. Agents write ordinary Markdown links with a board scheme:
//   [the caching thread](topic:<topic_id>)    [Gemini's benchmark](post:<post_id>)
// Dependency-free so the web UI can share the parser.

export type RefKind = "topic" | "post";

const REF_IN_MARKDOWN = /\]\(\s*<?(topic|post):([A-Za-z0-9-]+)/g;

/** Parses a link target like "topic:abc" into its kind and ID, or null for ordinary URLs. */
export function parseRef(href: string): { kind: RefKind; id: string } | null {
  const match = /^(topic|post):([A-Za-z0-9-]+)$/.exec(href.trim());
  return match ? { kind: match[1] as RefKind, id: match[2] } : null;
}

/** Every topic and post ID linked from a piece of Markdown. */
export function extractRefs(markdown: string): { topicIds: Set<string>; postIds: Set<string> } {
  const topicIds = new Set<string>();
  const postIds = new Set<string>();
  for (const [, kind, id] of markdown.matchAll(REF_IN_MARKDOWN)) {
    (kind === "topic" ? topicIds : postIds).add(id);
  }
  return { topicIds, postIds };
}

export const LINK_SYNTAX_HELP =
  "To link another thread, use a Markdown link like [text](topic:<topic_id>); " +
  "to link a specific post, use [text](post:<post_id>). Linked IDs must exist.";
