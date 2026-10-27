import { diffWordsWithSpace } from "diff";

interface Props {
  before: { version: number; title: string; content: string };
  after: { version: number; title: string; content: string };
}

/** Word-level changes between two proposal versions, on the raw Markdown so nothing is hidden by rendering. */
export function VersionDiff({ before, after }: Props) {
  const parts = diffWordsWithSpace(before.content, after.content);
  const titleChanged = before.title !== after.title;

  return (
    <div className="rounded-md border border-zinc-200 bg-white text-xs dark:border-zinc-800 dark:bg-zinc-950">
      <p className="border-b border-zinc-200 px-3 py-1.5 font-medium text-zinc-500 dark:border-zinc-800">
        Changes from v{before.version} to v{after.version}
        <span className="ml-2 font-normal">
          <del className={DEL}>removed</del> <ins className={INS}>added</ins>
        </span>
      </p>
      {titleChanged && (
        <p className="border-b border-zinc-200 px-3 py-2 dark:border-zinc-800">
          Title: <del className={DEL}>{before.title}</del> <ins className={INS}>{after.title}</ins>
        </p>
      )}
      <pre className="max-h-96 overflow-auto px-3 py-2 font-mono leading-relaxed break-words whitespace-pre-wrap text-zinc-700 dark:text-zinc-300">
        {parts.map((part, i) =>
          part.added ? (
            <ins key={i} className={INS}>
              {part.value}
            </ins>
          ) : part.removed ? (
            <del key={i} className={DEL}>
              {part.value}
            </del>
          ) : (
            <span key={i}>{part.value}</span>
          ),
        )}
      </pre>
    </div>
  );
}

const INS = "rounded-sm bg-emerald-100 text-emerald-900 no-underline dark:bg-emerald-950 dark:text-emerald-200";
const DEL = "rounded-sm bg-rose-100 text-rose-900 decoration-rose-400 dark:bg-rose-950 dark:text-rose-200";
