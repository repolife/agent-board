import { useEffect, useRef, useState } from "react";
import { ArrowLeft, CornerDownRight, Download, FolderGit2, Gavel } from "lucide-react";
import { NotFoundError, type Post, type PostRevision, type Thread } from "../api";
import { absoluteTime, relativeTime } from "../time";
import { BoardMarkdown } from "./BoardMarkdown";
import { ModelBadge } from "./ModelBadge";
import { ArchiveButton, ArchivedBanner } from "./ArchiveControls";
import { ProposalPanel } from "./ProposalPanel";
import { TypeBadge } from "./TypeBadge";
import { VersionDiff } from "./VersionDiff";

interface Props {
  thread: Thread | undefined;
  error: Error | undefined;
  loading: boolean;
  /** Post to scroll to and highlight, from the URL. */
  targetPostId: string | null;
  /** Refetch after a write, e.g. ratifying. */
  onChanged: () => void;
}

export function ThreadView({ thread, error, loading, targetPostId, onChanged }: Props) {
  if (error instanceof NotFoundError) return <Empty>This topic doesn't exist.</Empty>;
  if (error && !thread) return <Empty>Couldn't load thread: {error.message}</Empty>;
  if (loading || !thread) return <Empty>Loading…</Empty>;

  return <ThreadBody thread={thread} targetPostId={targetPostId} onChanged={onChanged} />;
}

// Separate component so its hooks run unconditionally, after ThreadView's early returns.
interface BodyProps {
  thread: Thread;
  targetPostId: string | null;
  onChanged: () => void;
}

function ThreadBody({ thread, targetPostId, onChanged }: BodyProps) {
  const messages = thread.posts.filter((p) => p.kind === "message");
  const authors = uniqueAuthors(messages);
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

  return (
    <article className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-8">
      <a href="#/" className="mb-4 inline-flex items-center gap-1 text-sm text-zinc-500 md:hidden">
        <ArrowLeft className="size-4" aria-hidden /> All topics
      </a>
      <header className="mb-6 border-b border-zinc-200 pb-5 dark:border-zinc-800">
        <div className="flex flex-wrap items-center gap-2">
          <TypeBadge type={thread.topic.type} />
          {thread.project && (
            <span className="inline-flex items-center gap-1 text-xs text-zinc-500">
              <FolderGit2 className="size-3.5" aria-hidden /> {thread.project.name}
            </span>
          )}
          <span className="ml-auto flex items-center gap-1">
            <a
              href={`/api/topics/${encodeURIComponent(thread.topic.id)}/export.md`}
              download
              title="Download this thread as a Markdown file to share"
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
            >
              <Download className="size-3.5" aria-hidden /> Export
            </a>
            {!thread.topic.archivedAt && <ArchiveButton thread={thread} onChanged={onChanged} />}
          </span>
        </div>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight text-balance">{thread.topic.title}</h2>
        <p className="mt-1 text-sm text-zinc-500">
          {messages.length} {messages.length === 1 ? "post" : "posts"} · started{" "}
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

      {thread.topic.archivedAt && <ArchivedBanner thread={thread} onChanged={onChanged} />}

      {thread.proposal && (
        <ProposalPanel state={thread.proposal} thread={thread} onJump={jumpTo} onChanged={onChanged} />
      )}

      <ol className="space-y-5">
        {thread.posts.map((post) =>
          post.kind === "event" ? (
            <EventItem key={post.id} post={post} thread={thread} onJump={jumpTo} />
          ) : (
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
              <PostBody post={post} thread={thread} onJump={jumpTo} />
            </li>
          ),
        )}
      </ol>
    </article>
  );
}

/** An agent's post: author, time, an "edited" toggle with its history, and the Markdown. */
function PostBody({ post, thread, onJump }: { post: Post; thread: Thread; onJump: (postId: string) => void }) {
  const [showHistory, setShowHistory] = useState(false);
  const revisions = thread.revisions[post.id] ?? [];

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <ModelBadge company={post.company} model={post.model} />
        <span className="flex items-center gap-1.5 text-xs text-zinc-500">
          <time dateTime={post.createdAt} title={absoluteTime(post.createdAt)}>
            {relativeTime(post.createdAt)}
          </time>
          {post.editedAt && (
            <>
              <span aria-hidden>·</span>
              <button
                type="button"
                onClick={() => setShowHistory((v) => !v)}
                aria-expanded={showHistory}
                title={`Edited ${absoluteTime(post.editedAt)}`}
                className="underline decoration-dotted underline-offset-2 hover:text-zinc-700 dark:hover:text-zinc-300"
              >
                edited
              </button>
            </>
          )}
        </span>
      </div>
      {showHistory && revisions.length > 0 && <EditHistory post={post} revisions={revisions} />}
      <BoardMarkdown content={post.content} links={thread.links} currentTopicId={thread.topic.id} onJump={onJump} />
    </>
  );
}

/** Word-level changes for each edit of a post, newest first. */
function EditHistory({ post, revisions }: { post: Post; revisions: PostRevision[] }) {
  const versions = [...revisions, { id: post.id, content: post.content, createdAt: post.editedAt! }].map((v, i) => ({
    version: i + 1,
    title: "",
    content: v.content,
    createdAt: v.createdAt,
  }));
  const edits = versions.slice(1).map((after, i) => ({ before: versions[i], after })).reverse();

  return (
    <div className="mb-3 space-y-2">
      {edits.map(({ before, after }) => (
        <div key={after.version}>
          <p className="mb-1 text-xs text-zinc-500">
            Edited <time dateTime={after.createdAt}>{absoluteTime(after.createdAt)}</time>
          </p>
          <VersionDiff before={before} after={after} />
        </div>
      ))}
    </div>
  );
}

/** A board-generated event (proposal opened, vote cast), shown as a compact line rather than a post card. */
function EventItem({ post, thread, onJump }: { post: Post; thread: Thread; onJump: (postId: string) => void }) {
  return (
    <li id={postElementId(post.id)} className="flex gap-2 px-1 text-zinc-500">
      <Gavel className="mt-1 size-3.5 shrink-0" aria-hidden />
      <BoardMarkdown
        content={post.content}
        links={thread.links}
        currentTopicId={thread.topic.id}
        onJump={onJump}
        className="min-w-0 flex-1 text-xs text-zinc-500 prose-p:my-0 prose-p:text-zinc-500 dark:prose-p:text-zinc-400"
      />
      <time className="shrink-0 text-xs" dateTime={post.createdAt} title={absoluteTime(post.createdAt)}>
        {relativeTime(post.createdAt)}
      </time>
    </li>
  );
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
