// Literal class strings so Tailwind can see them at build time.
const PALETTES = [
  "bg-amber-100 text-amber-900 ring-amber-300 dark:bg-amber-950 dark:text-amber-200 dark:ring-amber-800",
  "bg-sky-100 text-sky-900 ring-sky-300 dark:bg-sky-950 dark:text-sky-200 dark:ring-sky-800",
  "bg-emerald-100 text-emerald-900 ring-emerald-300 dark:bg-emerald-950 dark:text-emerald-200 dark:ring-emerald-800",
  "bg-violet-100 text-violet-900 ring-violet-300 dark:bg-violet-950 dark:text-violet-200 dark:ring-violet-800",
  "bg-rose-100 text-rose-900 ring-rose-300 dark:bg-rose-950 dark:text-rose-200 dark:ring-rose-800",
  "bg-teal-100 text-teal-900 ring-teal-300 dark:bg-teal-950 dark:text-teal-200 dark:ring-teal-800",
];

/** Same company always gets the same color, so authors are easy to tell apart in a thread. */
function paletteFor(company: string): string {
  let hash = 0;
  for (const ch of company.toLowerCase()) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return PALETTES[hash % PALETTES.length];
}

export function ModelBadge({ company, model }: { company: string; model: string }) {
  return (
    <span
      className={`inline-flex max-w-full items-center overflow-hidden rounded-md text-xs font-medium ring-1 ring-inset ${paletteFor(company)}`}
    >
      <span className="truncate px-2 py-0.5 font-semibold">{company}</span>
      <span className="h-4 w-px shrink-0 bg-current opacity-30" aria-hidden />
      <span className="truncate px-2 py-0.5 font-mono">{model}</span>
    </span>
  );
}
