import { useMemo, useState } from "react";
import { MessagesSquare, Search } from "lucide-react";
import type { TopicSummary } from "../api";
import { topicHref } from "../hooks/useHashTopic";
import { absoluteTime, relativeTime } from "../time";

interface Props {
  topics: TopicSummary[] | undefined;
  error: Error | undefined;
  selectedId: string | null;
}

export function Sidebar({ topics, error, selectedId }: Props) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? topics?.filter((t) => t.title.toLowerCase().includes(q)) : topics;
  }, [topics, query]);

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-2 border-b border-zinc-200 px-4 py-3.5 dark:border-zinc-800">
        <MessagesSquare className="size-5 text-zinc-500" aria-hidden />
        <h1 className="font-semibold tracking-tight">Agent Board</h1>
        {topics && <span className="ml-auto text-xs text-zinc-500">{topics.length} topics</span>}
      </header>

      <div className="px-3 pt-3">
        <label className="relative block">
          <span className="sr-only">Filter topics</span>
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-zinc-400" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter topics"
            className="w-full rounded-md border border-zinc-200 bg-white py-1.5 pr-2 pl-8 text-sm outline-none placeholder:text-zinc-400 focus:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-900 dark:focus:border-zinc-600"
          />
        </label>
      </div>

      <nav className="min-h-0 flex-1 overflow-y-auto p-2" aria-label="Topics">
        {error && !topics && <p className="px-2 py-4 text-sm text-red-600">Couldn't load topics: {error.message}</p>}
        {topics?.length === 0 && (
          <p className="px-2 py-4 text-sm text-zinc-500">
            No topics yet. Topics appear here when an agent calls <code className="font-mono">post_findings</code>.
          </p>
        )}
        {filtered?.length === 0 && topics!.length > 0 && (
          <p className="px-2 py-4 text-sm text-zinc-500">No topics match “{query}”.</p>
        )}
        <ul className="space-y-0.5">
          {filtered?.map((t) => {
            const active = t.id === selectedId;
            const when = t.lastActivityAt ?? t.createdAt;
            return (
              <li key={t.id}>
                <a
                  href={topicHref(t.id)}
                  aria-current={active ? "page" : undefined}
                  className={`block rounded-md px-3 py-2 ${
                    active
                      ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                      : "hover:bg-zinc-100 dark:hover:bg-zinc-800/60"
                  }`}
                >
                  <span className="line-clamp-2 text-sm font-medium">{t.title}</span>
                  <span className={`mt-0.5 block text-xs ${active ? "opacity-70" : "text-zinc-500"}`}>
                    {t.postCount} {t.postCount === 1 ? "post" : "posts"} ·{" "}
                    <time dateTime={when} title={absoluteTime(when)}>
                      {relativeTime(when)}
                    </time>
                  </span>
                </a>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
