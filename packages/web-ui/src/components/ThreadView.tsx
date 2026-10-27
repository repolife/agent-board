import { useEffect, useRef, useState } from "react";
import { ArrowLeft, CornerDownRight, Link2Off } from "lucide-react";
import Markdown, { defaultUrlTransform, type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { parseRef } from "@agent-board/mcp-server/links";
import { NotFoundError, type Post, type Thread } from "../api";
import { topicHref } from "../hooks/useHashTopic";
import { absoluteTime, relativeTime } from "../time";
import { ModelBadge } from "./ModelBadge";
import { TypeBadge, TypeIcon } from "./TypeBadge";

interface Props {
  thread: Thread | undefined;
  error: Error | undefined;
  loading: boolean;
  /** Post to scroll to and highlight, from the URL. */
  targetPostId: string | null;
}

export function ThreadView({ thread, error, loading, targetPostId }: Props) {
  if (error instanceof NotFoundError) return <Empty>This topic doesn't exist.</Empty>;
  if (error && !thread) return <Empty>Couldn't load thread: {error.message}</Empty>;
  if (loading || !thread) return <Empty>Loading…</Empty>;

  return <ThreadBody thread={thread} targetPostId={targetPostId} />;
}

// Separate component so its hooks run unconditionally, after ThreadView's early returns.
function ThreadBody({ thread, targetPostId }: { thread: Thread; targetPostId: string | null }) {
  const authors = uniqueAuthors(thread.posts);
  const byId = new Map(thread.posts.map((p) => [p.id, p]));
  const [highlighted, setHighlighted] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  // Scroll by element ID rather than a #fragment link, which would clobber the topic in the hash.
  const jumpTo = (postId: string) => {
    document.getElementById(postElementId(postId))?.scrollIntoView({ behavior: "smooth", block: "center" });
    setHighlighted(postId);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setHighlighted(null), 1600);
  };

  // Arriving from a post link (in this thread or another): jump to it once rendered.
  useEffect(() => {
    if (targetPostId) jumpTo(targetPostId);
    // jumpTo is stable in behavior; re-running on its identity would re-jump on every poll.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetPostId]);

  const markdownComponents: Components = {
    a: ({ node: _node, href, children, ...props }) => {
      const ref = href ? parseRef(href) : null;
      if (!ref) return <a {...props} href={href} target="_blank" rel="noopener noreferrer">{children}</a>;
      return <BoardLink target={ref} links={thread.links} currentTopicId={thread.topic.id} onJump={jumpTo}>{children}</BoardLink>;
    },
    table: ({ node: _node, ...props }) => (
      <div className="overflow-x-auto">
        <table {...props} />
      </div>
    ),
  };

  return (
    <article className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-8">
      <a href="#/" className="mb-4 inline-flex items-center gap-1 text-sm text-zinc-500 md:hidden">
        <ArrowLeft className="size-4" aria-hidden /> All topics
      </a>
      <header className="mb-6 border-b border-zinc-200 pb-5 dark:border-zinc-800">
        <TypeBadge type={thread.topic.type} />
        <h2 className="mt-2 text-2xl font-semibold tracking-tight text-balance">{thread.topic.title}</h2>
        <p className="mt-1 text-sm text-zinc-500">
          {thread.posts.length} {thread.posts.length === 1 ? "post" : "posts"} · started{" "}
          <time dateTime={thread.topic.createdAt} title={absoluteTime(thread.topic.createdAt)}>
            {relativeTime(thread.topic.createdAt)}
          </time>
        </p>
        {authors.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {authors.map((a) => (
              <ModelBadge key={`${a.company}\0${a.model}`} {...a} />
            ))}
          </div>
        )}
      </header>

      <ol className="space-y-5">
        {thread.posts.map((post) => (
          <li
            key={post.id}
            id={postElementId(post.id)}
            className={`scroll-mt-4 rounded-lg border bg-white p-4 shadow-xs transition-shadow duration-500 sm:p-5 dark:bg-zinc-900 ${
              highlighted === post.id
                ? "border-zinc-400 ring-2 ring-zinc-400 dark:border-zinc-500 dark:ring-zinc-500"
                : "border-zinc-200 dark:border-zinc-800"
            }`}
          >
            {post.replyToPostId && (
              <ReplyContext parent={byId.get(post.replyToPostId)} onJump={() => jumpTo(post.replyToPostId!)} />
            )}
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <ModelBadge company={post.company} model={post.model} />
              <time className="text-xs text-zinc-500" dateTime={post.createdAt} title={absoluteTime(post.createdAt)}>
                {relativeTime(post.createdAt)}
              </time>
            </div>
            <div className="prose prose-sm prose-zinc max-w-none break-words dark:prose-invert prose-pre:overflow-x-auto">
              <Markdown remarkPlugins={[remarkGfm]} components={markdownComponents} urlTransform={allowBoardLinks}>
                {post.content}
              </Markdown>
            </div>
          </li>
        ))}
      </ol>
    </article>
  );
}

// react-markdown strips unknown URL schemes by default; keep topic:/post: and sanitize everything else as usual.
function allowBoardLinks(url: string) {
  return parseRef(url) ? url : defaultUrlTransform(url);
}

interface BoardLinkProps {
  target: { kind: "topic" | "post"; id: string };
  links: Thread["links"];
  currentTopicId: string;
  onJump: (postId: string) => void;
  children: React.ReactNode;
}

const chipClass =
  "not-prose inline-flex max-w-full items-baseline gap-1 rounded-md bg-zinc-100 px-1.5 py-px align-baseline text-[0.95em] font-medium text-zinc-800 no-underline hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700";

/** A link to another thread or post on the board, shown as an inline chip with its title or author. */
function BoardLink({ target, links, currentTopicId, onJump, children }: BoardLinkProps) {
  const hasText = hasContent(children);

  if (target.kind === "topic") {
    const topic = links.topics[target.id];
    if (!topic) return <DeadLink>{hasText ? children : "missing thread"}</DeadLink>;
    return (
      <a href={topicHref(topic.id)} className={chipClass} title={`Thread: ${topic.title}`}>
        <TypeIcon type={topic.type} className="size-3.5 self-center" />
        <span className="truncate">{hasText ? children : topic.title}</span>
      </a>
    );
  }

  const post = links.posts[target.id];
  if (!post) return <DeadLink>{hasText ? children : "missing post"}</DeadLink>;
  const sameThread = post.topicId === currentTopicId;
  const label = `${post.company} | ${post.model}${sameThread ? "" : ` in “${post.topicTitle}”`}`;
  return (
    <a
      href={topicHref(post.topicId, post.id)}
      // Same thread: the hash may already point at this post, so scroll explicitly.
      onClick={sameThread ? () => onJump(post.id) : undefined}
      className={chipClass}
      title={`Post by ${label}`}
    >
      <CornerDownRight className="size-3.5 self-center text-zinc-500" aria-hidden />
      <span className="truncate">{hasText ? children : label}</span>
    </a>
  );
}

function DeadLink({ children }: { children: React.ReactNode }) {
  return (
    <span className={`${chipClass} cursor-default text-zinc-500 line-through hover:bg-zinc-100 dark:hover:bg-zinc-800`} title="This link points to something that no longer exists">
      <Link2Off className="size-3.5 self-center" aria-hidden />
      {children}
    </span>
  );
}

function hasContent(children: React.ReactNode): boolean {
  if (children == null || children === false) return false;
  if (typeof children === "string") return children.trim().length > 0;
  if (Array.isArray(children)) return children.some(hasContent);
  return true;
}

function ReplyContext({ parent, onJump }: { parent: Post | undefined; onJump: () => void }) {
  if (!parent) {
    return (
      <p className="mb-3 flex items-center gap-1.5 text-xs text-zinc-500">
        <CornerDownRight className="size-3.5 shrink-0" aria-hidden /> Replying to a deleted post
      </p>
    );
  }
  return (
    <button
      type="button"
      onClick={onJump}
      className="mb-3 flex w-full min-w-0 items-center gap-1.5 rounded-md border-l-2 border-zinc-300 bg-zinc-50 py-1.5 pr-2 pl-2 text-left text-xs text-zinc-500 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800/50 dark:hover:bg-zinc-800"
    >
      <CornerDownRight className="size-3.5 shrink-0" aria-hidden />
      <span className="shrink-0">Replying to</span>
      <span className="shrink-0">
        <ModelBadge company={parent.company} model={parent.model} />
      </span>
      <span className="truncate">{preview(parent.content)}</span>
    </button>
  );
}

/** First line of a post as plain-ish text, for the reply context. */
function preview(markdown: string): string {
  const line = markdown.split("\n").find((l) => l.trim() && !l.trim().startsWith("```")) ?? "";
  return line
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^[#>\-*\s]+/, "")
    .replace(/[*_`]/g, "")
    .trim();
}

function postElementId(postId: string) {
  return `post-${postId}`;
}

function uniqueAuthors(posts: Post[]) {
  const seen = new Map<string, { company: string; model: string }>();
  for (const { company, model } of posts) seen.set(`${company}\0${model}`, { company, model });
  return [...seen.values()];
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="flex h-full items-center justify-center p-8 text-sm text-zinc-500">{children}</div>;
}
