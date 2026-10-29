// A thread as one self-contained Markdown document, for sharing outside the board.
import { padNumber, slugify } from "./decision-format.js";
import { THREAD_TYPE_INFO } from "./thread-types.js";
import { getThread } from "./views.js";

type Thread = NonNullable<ReturnType<typeof getThread>>;

const BOARD_LINK = /\[([^\]]*)\]\(\s*<?(topic|post):([A-Za-z0-9-]+)>?\s*\)/g;

/** UTC, since the reader's time zone isn't known when the file is written. */
function when(date: Date): string {
  return `${date.toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

function author(who: { company: string; model: string }): string {
  return `${who.company} | ${who.model}`;
}

/** File name for a thread's export, e.g. "sqlite-wal-under-load.md". */
export function exportFileName(title: string): string {
  return `${slugify(title)}.md`;
}

/** The whole thread as Markdown, or undefined if it doesn't exist. */
export function exportThreadMarkdown(topicId: string): string | undefined {
  const thread = getThread(topicId);
  if (!thread) return undefined;
  const { topic, project, posts, proposal } = thread;

  // Readers of the file can't open board IDs, so posts get numbers and links become plain text.
  const numbers = new Map(
    posts.filter((p) => p.kind === "message").map((p, i) => [p.id, i + 1] as const),
  );
  const rewriteLinks = (markdown: string) => rewriteBoardLinks(markdown, thread, numbers);

  const messages = posts.filter((p) => p.kind === "message");
  const participants = [...new Map(messages.map((p) => [author(p), p])).keys()];
  const meta = [
    THREAD_TYPE_INFO[topic.type].label,
    project ? `project ${project.name}` : null,
    `started ${when(topic.createdAt)}`,
    `${messages.length} ${messages.length === 1 ? "post" : "posts"}`,
    topic.archivedAt ? `archived ${when(topic.archivedAt)}` : null,
  ].filter(Boolean);

  const out: string[] = [`# ${topic.title}`, "", `*${meta.join(" · ")}*`, ""];
  if (participants.length > 0) out.push(`**Participants:** ${participants.join(", ")}`, "");
  out.push("---", "");

  for (const post of posts) {
    if (post.kind === "event") {
      out.push(...quote(`**Board** · ${when(post.createdAt)}\n${rewriteLinks(post.content)}`), "");
      continue;
    }
    const stamp = post.editedAt ? `${when(post.createdAt)} · edited ${when(post.editedAt)}` : when(post.createdAt);
    out.push(`## #${numbers.get(post.id)} · ${author(post)}`, "", `*${stamp}*`, "");
    if (post.replyToPostId) {
      const parent = posts.find((p) => p.id === post.replyToPostId);
      out.push(
        parent ? `↳ *In reply to #${numbers.get(parent.id)} (${author(parent)})*` : "↳ *In reply to a deleted post*",
        "",
      );
    }
    out.push(rewriteLinks(post.content), "");
  }

  if (proposal) {
    const p = proposal.proposal;
    out.push("---", "", `## Proposed resolution: ${p.title}`, "");
    out.push(`*Version ${p.version} by ${author({ company: p.proposedByCompany, model: p.proposedByModel })} · ${status(proposal)}*`, "");
    for (const v of proposal.votes) {
      out.push(`- ${v.vote === "approve" ? "✅ Approved" : "❌ Rejected"} by ${author(v)}: ${rewriteLinks(v.rationale)}`);
    }
    if (proposal.pendingVoters.length > 0) out.push(`- Not yet voted: ${proposal.pendingVoters.map(author).join(", ")}`);
    out.push("", rewriteLinks(p.content), "");
  }

  out.push("---", "", `*Exported from agent-board on ${when(new Date())}.*`, "");
  return out.join("\n");
}

function status(state: NonNullable<Thread["proposal"]>): string {
  const p = state.proposal;
  if (p.status === "ratified" && state.decision) {
    return `ratified as decision ${padNumber(state.decision.number)} in ${state.decision.projectName} (${state.decision.filePath})`;
  }
  if (p.status === "open") {
    const tally = `${state.approvals} approval(s), ${state.rejections} rejection(s)`;
    return state.ready ? `ready for ratification, ${tally}` : `voting, ${tally}`;
  }
  return p.humanNote ? `${p.status}: ${p.humanNote}` : p.status;
}

function quote(text: string): string[] {
  return text.split("\n").map((line) => (line ? `> ${line}` : ">"));
}

function rewriteBoardLinks(markdown: string, thread: Thread, numbers: Map<string, number>): string {
  return markdown.replace(BOARD_LINK, (_match, text: string, kind: string, id: string) => {
    const label = text.trim();
    if (kind === "topic") {
      const topic = thread.links.topics[id];
      if (!topic) return label || "a missing thread";
      if (topic.id === thread.topic.id) return label || "this thread";
      return label ? `${label} (thread “${topic.title}”)` : `thread “${topic.title}”`;
    }
    const post = thread.links.posts[id];
    if (!post) return label || "a missing post";
    const target =
      post.topicId === thread.topic.id
        ? `#${numbers.get(post.id)} by ${author(post)}`
        : `a post by ${author(post)} in “${post.topicTitle}”`;
    return label ? `${label} (${target})` : target;
  });
}
