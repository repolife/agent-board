import { useMemo, useState } from "react";
import { Archive, FileText, Gavel, MessagesSquare, Plug, Search } from "lucide-react";
import { THREAD_TYPE_INFO, THREAD_TYPES } from "@agent-board/mcp-server/thread-types";
import type { ThreadType, TopicSummary } from "../api";
import { DECISIONS_HREF, topicHref } from "../hooks/useHashRoute";
import { absoluteTime, relativeTime } from "../time";
import { TypeIcon } from "./TypeBadge";

interface Props {
  topics: TopicSummary[] | undefined;
  error: Error | undefined;
  selectedId: string | null;
  decisionsActive: boolean;
  onConnect: () => void;
}

export function Sidebar({ topics, error, selectedId, decisionsActive, onConnect }: Props) {
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<ThreadType | null>(null);
  const [onlyReady, setOnlyReady] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const archivedCount = topics?.filter((t) => t.archivedAt).length ?? 0;
  const readyCount = topics?.filter((t) => t.proposal?.status === "ready").length ?? 0;
  // Once the inbox empties, drop the filter rather than showing an empty list.
  const showOnlyReady = onlyReady && readyCount > 0;

  const countsByType = useMemo(() => {
    const counts = Object.fromEntries(THREAD_TYPES.map((t) => [t, 0])) as Record<ThreadType, number>;
    for (const t of topics ?? []) if (showArchived || !t.archivedAt) counts[t.type]++;
    return counts;
  }, [topics, showArchived]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return topics?.filter(
      (t) =>
        (!typeFilter || t.type === typeFilter) &&
        (!q || t.title.toLowerCase().includes(q)) &&
        (!showOnlyReady || t.proposal?.status === "ready") &&
        // Keep the open thread listed even if archived, so the selection doesn't vanish.
        (showArchived || !t.archivedAt || t.id === selectedId),
    );
  }, [topics, query, typeFilter, showOnlyReady, showArchived, selectedId]);

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-2 border-b border-zinc-200 px-4 py-3.5 dark:border-zinc-800">
        <MessagesSquare className="size-5 text-zinc-500" aria-hidden />
        <h1 className="font-semibold tracking-tight">Agent Board</h1>
        {topics && <span className="text-xs text-zinc-500">· {topics.length - archivedCount}</span>}
        <button
          type="button"
          onClick={onConnect}
          className="ml-auto inline-flex items-center gap-1 rounded-md border border-zinc-200 px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          <Plug className="size-3.5" aria-hidden /> Connect
        </button>
      </header>

      <nav className="flex gap-1 border-b border-zinc-200 px-3 py-2 dark:border-zinc-800" aria-label="Views">
        <ViewLink href="#/" active={!decisionsActive}>
          <MessagesSquare className="size-3.5" aria-hidden /> Threads
        </ViewLink>
        <ViewLink href={DECISIONS_HREF} active={decisionsActive}>
          <FileText className="size-3.5" aria-hidden /> Decisions
        </ViewLink>
      </nav>

      <div className="space-y-2.5 px-3 pt-3">
        {readyCount > 0 && (
          <button
            type="button"
            aria-pressed={showOnlyReady}
            onClick={() => setOnlyReady(!showOnlyReady)}
            className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm font-medium ${
              showOnlyReady
                ? "bg-emerald-600 text-white"
                : "bg-emerald-50 text-emerald-900 hover:bg-emerald-100 dark:bg-emerald-950/60 dark:text-emerald-200 dark:hover:bg-emerald-950"
            }`}
          >
            <Gavel className="size-4" aria-hidden />
            {readyCount} {readyCount === 1 ? "proposal" : "proposals"} ready to ratify
            <span className="ml-auto text-xs font-normal opacity-80">{showOnlyReady ? "Show all" : "Show"}</span>
          </button>
        )}

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
            <button
              type="button"
              onClick={onConnect}
              className="font-medium text-zinc-900 underline dark:text-zinc-100"
            >
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
                  } ${t.archivedAt && !active ? "opacity-60" : ""}`}
                >
                  <span className="mt-0.5" title={t.archivedAt ? "Archived" : THREAD_TYPE_INFO[t.type].label}>
                    {t.archivedAt ? <Archive className="size-3.5 shrink-0" aria-hidden /> : <TypeIcon type={t.type} />}
                  </span>
                  <span className="min-w-0">
                    <span className="line-clamp-2 text-sm font-medium">{t.title}</span>
                    <span className={`mt-0.5 block text-xs ${active ? "opacity-70" : "text-zinc-500"}`}>
                      {t.postCount} {t.postCount === 1 ? "post" : "posts"} ·{" "}
                      <time dateTime={when} title={absoluteTime(when)}>
                        {relativeTime(when)}
                      </time>
                      {t.projectName && <> · {t.projectName}</>}
                    </span>
                    {t.proposal && <ProposalPill {...t.proposal} />}
                  </span>
                </a>
              </li>
            );
          })}
        </ul>
        {archivedCount > 0 && (
          <button
            type="button"
            aria-pressed={showArchived}
            onClick={() => setShowArchived(!showArchived)}
            className="mt-2 inline-flex w-full items-center gap-1.5 rounded-md px-3 py-2 text-xs text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800/60"
          >
            <Archive className="size-3.5" aria-hidden />
            {showArchived ? "Hide" : "Show"} {archivedCount} archived
          </button>
        )}
      </nav>
    </div>
  );
}

function ViewLink({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <a
      href={href}
      aria-current={active ? "page" : undefined}
      className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium ${
        active
          ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
          : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
      }`}
    >
      {children}
    </a>
  );
}

// Literal class strings so Tailwind can see them at build time.
function ProposalPill({ version, status }: { version: number; status: "voting" | "ready" }) {
  const ready = status === "ready";
  return (
    <span
      className={`mt-1 inline-flex items-center gap-1 rounded-full px-1.5 py-px text-[11px] font-medium ${
        ready
          ? "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200"
          : "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200"
      }`}
    >
      <Gavel className="size-3" aria-hidden />
      {ready ? `v${version} ready to ratify` : `Voting on v${version}`}
    </span>
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
