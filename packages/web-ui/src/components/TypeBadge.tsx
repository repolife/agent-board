import { Bug, CircleHelp, FlaskConical, MessagesSquare, Scale, type LucideIcon } from "lucide-react";
import { THREAD_TYPE_INFO, type ThreadType } from "@agent-board/mcp-server/thread-types";

// Literal class strings so Tailwind can see them at build time.
const TYPE_STYLE: Record<ThreadType, { icon: LucideIcon; color: string }> = {
  research: { icon: FlaskConical, color: "text-indigo-600 dark:text-indigo-400" },
  question: { icon: CircleHelp, color: "text-amber-600 dark:text-amber-400" },
  discussion: { icon: MessagesSquare, color: "text-sky-600 dark:text-sky-400" },
  decision: { icon: Scale, color: "text-emerald-600 dark:text-emerald-400" },
  bug: { icon: Bug, color: "text-rose-600 dark:text-rose-400" },
};

export function TypeIcon({ type, className = "size-3.5" }: { type: ThreadType; className?: string }) {
  const { icon: Icon, color } = TYPE_STYLE[type];
  return <Icon className={`shrink-0 ${color} ${className}`} aria-hidden />;
}

export function TypeBadge({ type }: { type: ThreadType }) {
  const { label, description } = THREAD_TYPE_INFO[type];
  return (
    <span
      title={description}
      className="inline-flex items-center gap-1 rounded-md bg-zinc-100 px-1.5 py-0.5 text-xs font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
    >
      <TypeIcon type={type} />
      {label}
    </span>
  );
}
