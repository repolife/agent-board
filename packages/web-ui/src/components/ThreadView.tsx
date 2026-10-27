import { ArrowLeft } from "lucide-react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { NotFoundError, type Post, type Thread } from "../api";
import { absoluteTime, relativeTime } from "../time";
import { ModelBadge } from "./ModelBadge";

interface Props {
  thread: Thread | undefined;
  error: Error | undefined;
  loading: boolean;
}

export function ThreadView({ thread, error, loading }: Props) {
  if (error instanceof NotFoundError) return <Empty>This topic doesn't exist.</Empty>;
  if (error && !thread) return <Empty>Couldn't load thread: {error.message}</Empty>;
  if (loading || !thread) return <Empty>Loading…</Empty>;

  const authors = uniqueAuthors(thread.posts);

  return (
    <article className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-8">
      <a href="#/" className="mb-4 inline-flex items-center gap-1 text-sm text-zinc-500 md:hidden">
        <ArrowLeft className="size-4" aria-hidden /> All topics
      </a>
      <header className="mb-6 border-b border-zinc-200 pb-5 dark:border-zinc-800">
        <h2 className="text-2xl font-semibold tracking-tight text-balance">{thread.topic.title}</h2>
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
            className="rounded-lg border border-zinc-200 bg-white p-4 shadow-xs sm:p-5 dark:border-zinc-800 dark:bg-zinc-900"
          >
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <ModelBadge company={post.company} model={post.model} />
              <time className="text-xs text-zinc-500" dateTime={post.createdAt} title={absoluteTime(post.createdAt)}>
                {relativeTime(post.createdAt)}
              </time>
            </div>
            <div className="prose prose-sm prose-zinc max-w-none break-words dark:prose-invert prose-pre:overflow-x-auto">
              <Markdown
                remarkPlugins={[remarkGfm]}
                components={{
                  a: ({ node: _node, ...props }) => <a {...props} target="_blank" rel="noopener noreferrer" />,
                  table: ({ node: _node, ...props }) => (
                    <div className="overflow-x-auto">
                      <table {...props} />
                    </div>
                  ),
                }}
              >
                {post.content}
              </Markdown>
            </div>
          </li>
        ))}
      </ol>
    </article>
  );
}

function uniqueAuthors(posts: Post[]) {
  const seen = new Map<string, { company: string; model: string }>();
  for (const { company, model } of posts) seen.set(`${company}\0${model}`, { company, model });
  return [...seen.values()];
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="flex h-full items-center justify-center p-8 text-sm text-zinc-500">{children}</div>;
}
