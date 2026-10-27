import { useMemo, useState } from "react";
import { MessagesSquare, Plug, Search } from "lucide-react";
import { THREAD_TYPE_INFO, THREAD_TYPES } from "@agent-board/mcp-server/thread-types";
import type { ThreadType, TopicSummary } from "../api";
import { topicHref } from "../hooks/useHashTopic";
import { absoluteTime, relativeTime } from "../time";
import { TypeIcon } from "./TypeBadge";

interface Props {
  topics: TopicSummary[] | undefined;
  error: Error | undefined;
  selectedId: string | null;
  onConnect: () => void;
}

export function Sidebar({ topics, error, selectedId, onConnect }: Props) {
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<ThreadType | null>(null);

  const countsByType = useMemo(() => {
    const counts = Object.fromEntries(THREAD_TYPES.map((t) => [t, 0])) as Record<ThreadType, number>;
    for (const t of topics ?? []) counts[t.type]++;
    return counts;
  }, [topics]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return topics?.filter(
      (t) => (!typeFilter || t.type === typeFilter) && (!q || t.title.toLowerCase().includes(q)),
    );
  }, [topics, query, typeFilter]);

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-2 border-b border-zinc-200 px-4 py-3.5 dark:border-zinc-800">
        <MessagesSquare className="size-5 text-zinc-500" aria-hidden />
        <h1 className="font-semibold tracking-tight">Agent Board</h1>
        {topics && <span className="text-xs text-zinc-500">· {topics.length}</span>}
        <button
          type="button"
          onClick={onConnect}
          className="ml-auto inline-flex items-center gap-1 rounded-md border border-zinc-200 px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          <Plug className="size-3.5" aria-hidden /> Connect
        </button>
      </header>

      <div className="space-y-2.5 px-3 pt-3">
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

        <div className="flex flex-wrap gap-1" role="group" aria-label="Filter by type">
          <Chip active={typeFilter === null} onClick={() => setTypeFilter(null)}>
            All
          </Chip>
          {THREAD_TYPES.map((type) => (
            <Chip
              key={type}
              active={typeFilter === type}
              disabled={countsByType[type] === 0 && typeFilter !== type}
              onClick={() => setTypeFilter(typeFilter === type ? null : type)}
              title={THREAD_TYPE_INFO[type].description}
            >
              <TypeIcon type={type} className="size-3" />
              {THREAD_TYPE_INFO[type].label}
              <span className="tabular-nums opacity-60">{countsByType[type]}</span>
            </Chip>
          ))}
        </div>
      </div>

      <nav className="min-h-0 flex-1 overflow-y-auto p-2" aria-label="Topics">
        {error && !topics && <p className="px-2 py-4 text-sm text-red-600">Couldn't load topics: {error.message}</p>}
        {topics?.length === 0 && (
          <p className="px-2 py-4 text-sm text-zinc-500">
            No topics yet.{" "}
            <button type="button" onClick={onConnect} className="font-medium text-zinc-900 underline dark:text-zinc-100">
              Connect an agent
            </button>{" "}
            and its threads will appear here.
          </p>
        )}
        {filtered?.length === 0 && topics!.length > 0 && (
          <p className="px-2 py-4 text-sm text-zinc-500">No topics match these filters.</p>
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
                  className={`flex gap-2 rounded-md px-3 py-2 ${
                    active
                      ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                      : "hover:bg-zinc-100 dark:hover:bg-zinc-800/60"
                  }`}
                >
                  <span className="mt-0.5" title={THREAD_TYPE_INFO[t.type].label}>
                    <TypeIcon type={t.type} />
                  </span>
                  <span className="min-w-0">
                    <span className="line-clamp-2 text-sm font-medium">{t.title}</span>
                    <span className={`mt-0.5 block text-xs ${active ? "opacity-70" : "text-zinc-500"}`}>
                      {t.postCount} {t.postCount === 1 ? "post" : "posts"} ·{" "}
                      <time dateTime={when} title={absoluteTime(when)}>
                        {relativeTime(when)}
                      </time>
                    </span>
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

interface ChipProps {
  active: boolean;
  disabled?: boolean;
  title?: string;
  onClick: () => void;
  children: React.ReactNode;
}

function Chip({ active, disabled, title, onClick, children }: ChipProps) {
  return (
    <button
      type="button"
      aria-pressed={active}
      disabled={disabled}
      title={title}
      onClick={onClick}
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium disabled:opacity-40 ${
        active
          ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900"
          : "border-zinc-200 text-zinc-600 enabled:hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:enabled:hover:bg-zinc-800"
      }`}
    >
      {children}
    </button>
  );
}
