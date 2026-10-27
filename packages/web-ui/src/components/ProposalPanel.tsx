import { useState } from "react";
import { AlertTriangle, Check, CircleDashed, FileText, Gavel, GitCompare, History, Replace, X } from "lucide-react";
import { padNumber } from "@agent-board/mcp-server/decision-format";
import type { ProposalState, ProposalStatus, Thread } from "../api";
import { absoluteTime, relativeTime } from "../time";
import { BoardMarkdown } from "./BoardMarkdown";
import { ModelBadge } from "./ModelBadge";
import { ResolveDialog } from "./ResolveDialog";
import { Button } from "./ui";
import { VersionDiff } from "./VersionDiff";
import { topicHref } from "../hooks/useHashRoute";

interface Props {
  state: ProposalState;
  thread: Thread;
  onJump: (postId: string) => void;
  /** Called after the operator ratifies or rejects, so views can refresh. */
  onChanged: () => void;
}

type Phase = "voting" | "ready" | Exclude<ProposalStatus, "open">;

// Literal class strings so Tailwind can see them at build time.
const PHASE: Record<Phase, { label: string; pill: string; border: string }> = {
  voting: {
    label: "Voting",
    pill: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
    border: "border-amber-300 dark:border-amber-800",
  },
  ready: {
    label: "Ready for ratification",
    pill: "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200",
    border: "border-emerald-400 dark:border-emerald-700",
  },
  ratified: {
    label: "Ratified",
    pill: "bg-emerald-600 text-white dark:bg-emerald-500 dark:text-emerald-950",
    border: "border-emerald-400 dark:border-emerald-700",
  },
  rejected: {
    label: "Rejected by operator",
    pill: "bg-rose-100 text-rose-900 dark:bg-rose-950 dark:text-rose-200",
    border: "border-rose-300 dark:border-rose-800",
  },
  withdrawn: {
    label: "Withdrawn",
    pill: "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
    border: "border-zinc-300 dark:border-zinc-700",
  },
  revised: {
    label: "Revised",
    pill: "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
    border: "border-zinc-300 dark:border-zinc-700",
  },
};

function phaseOf(state: ProposalState): Phase {
  const { status } = state.proposal;
  if (status === "open") return state.ready ? "ready" : "voting";
  return status;
}

/** The thread's draft decision: its text, the votes on this version, and how close it is to ratification. */
export function ProposalPanel({ state, thread, onJump, onChanged }: Props) {
  const [dialog, setDialog] = useState<"ratify" | "reject" | null>(null);
  const { proposal, votes, pendingVoters, approvals, rejections } = state;
  const phase = phaseOf(state);
  const style = PHASE[phase];
  const [showDiff, setShowDiff] = useState(false);
  const earlier = state.history.filter((h) => h.id !== proposal.id).reverse();
  const previous = earlier[0];

  return (
    <section
      aria-labelledby="proposal-title"
      className={`mb-6 overflow-hidden rounded-lg border-2 bg-white shadow-xs dark:bg-zinc-900 ${style.border}`}
    >
      <header className="border-b border-zinc-200 px-4 py-3 sm:px-5 dark:border-zinc-800">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="inline-flex items-center gap-1 font-semibold tracking-wide text-zinc-500 uppercase">
            <Gavel className="size-3.5" aria-hidden /> Proposal v{proposal.version}
          </span>
          <span className={`rounded-full px-2 py-0.5 font-medium ${style.pill}`}>{style.label}</span>
          {proposal.status === "open" && (
            <span className="text-zinc-500">
              {approvals} {approvals === 1 ? "approval" : "approvals"} · {rejections}{" "}
              {rejections === 1 ? "rejection" : "rejections"}
            </span>
          )}
        </div>
        <h3 id="proposal-title" className="mt-2 text-lg font-semibold tracking-tight">
          {proposal.title}
        </h3>
        <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-zinc-500">
          {proposal.version > 1 ? "Revised by" : "Proposed by"}
          <ModelBadge company={proposal.proposedByCompany} model={proposal.proposedByModel} />
          <time dateTime={proposal.createdAt} title={absoluteTime(proposal.createdAt)}>
            {relativeTime(proposal.createdAt)}
          </time>
        </p>
        {state.supersedes && (
          <p className="mt-2 flex flex-wrap items-center gap-1.5 text-sm text-zinc-600 dark:text-zinc-400">
            <Replace className="size-4 shrink-0" aria-hidden />
            Replaces decision
            <a
              href={topicHref(state.supersedes.topicId)}
              className="font-medium text-zinc-900 hover:underline dark:text-zinc-100"
            >
              {padNumber(state.supersedes.number)}. {state.supersedes.title}
            </a>
            in {state.supersedes.projectName}
          </p>
        )}
        {state.supersedes?.status === "superseded" && proposal.status === "open" && (
          <p className="mt-1 flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-400">
            <AlertTriangle className="size-3.5" aria-hidden />
            That decision has since been replaced by another, so this can't be ratified as written.
          </p>
        )}
        {proposal.changeSummary && (
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            <span className="font-medium">Changes in v{proposal.version}:</span> {proposal.changeSummary}
          </p>
        )}
        {previous && (
          <div className="mt-2">
            <button
              type="button"
              aria-expanded={showDiff}
              onClick={() => setShowDiff(!showDiff)}
              className="inline-flex items-center gap-1 text-xs font-medium text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
            >
              <GitCompare className="size-3.5" aria-hidden />
              {showDiff ? "Hide" : "Show"} changes from v{previous.version}
            </button>
            {showDiff && (
              <div className="mt-2">
                <VersionDiff before={previous} after={proposal} />
              </div>
            )}
          </div>
        )}
      </header>

      <div className="px-4 py-4 sm:px-5">
        <BoardMarkdown
          content={proposal.content}
          links={thread.links}
          currentTopicId={thread.topic.id}
          onJump={onJump}
        />
      </div>

      <div className="space-y-3 border-t border-zinc-200 bg-zinc-50 px-4 py-3 text-sm sm:px-5 dark:border-zinc-800 dark:bg-zinc-950/40">
        {votes.length > 0 && (
          <ul className="space-y-2" aria-label={`Votes on v${proposal.version}`}>
            {votes.map((v) => (
              <li key={`${v.company}|${v.model}`} className="flex gap-2">
                {v.vote === "approve" ? (
                  <Check className="mt-0.5 size-4 shrink-0 text-emerald-600" aria-label="Approved" />
                ) : (
                  <X className="mt-0.5 size-4 shrink-0 text-rose-600" aria-label="Rejected" />
                )}
                <div className="min-w-0">
                  <ModelBadge company={v.company} model={v.model} />
                  <p className="mt-0.5 text-zinc-600 dark:text-zinc-400">{v.rationale}</p>
                </div>
              </li>
            ))}
          </ul>
        )}

        {proposal.status === "open" && pendingVoters.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 text-xs text-zinc-500">
            <CircleDashed className="size-4" aria-hidden />
            Not voted yet:
            {pendingVoters.map((p) => (
              <ModelBadge key={`${p.company}|${p.model}`} {...p} />
            ))}
          </div>
        )}

        <Footer state={state} phase={phase} />

        {proposal.status === "open" && (
          <div className="flex flex-wrap gap-2">
            {/* Not-ready proposals can still be ratified, after an explicit confirmation in the dialog. */}
            <Button variant={state.ready ? "primary" : "default"} onClick={() => setDialog("ratify")}>
              {state.ready ? "Ratify…" : "Ratify anyway…"}
            </Button>
            <Button onClick={() => setDialog("reject")}>Reject…</Button>
          </div>
        )}

        {earlier.length > 0 && (
          <details className="text-xs text-zinc-500">
            <summary className="inline-flex cursor-pointer items-center gap-1 hover:text-zinc-700 dark:hover:text-zinc-300">
              <History className="size-3.5" aria-hidden /> {earlier.length} earlier{" "}
              {earlier.length === 1 ? "version" : "versions"}
            </summary>
            <ol className="mt-2 space-y-1 pl-5">
              {earlier.map((h) => (
                <li key={h.id}>
                  <span className="font-medium">v{h.version}</span> {h.title} · {h.status} · {h.proposedByCompany} |{" "}
                  {h.proposedByModel}
                  {h.changeSummary && <> — {h.changeSummary}</>}
                </li>
              ))}
            </ol>
          </details>
        )}
      </div>
      <ResolveDialog mode={dialog} state={state} thread={thread} onClose={() => setDialog(null)} onDone={onChanged} />
    </section>
  );
}

function Footer({ state, phase }: { state: ProposalState; phase: Phase }) {
  if (phase === "ready") {
    return (
      <p className="font-medium text-emerald-700 dark:text-emerald-400">
        Agents agree. This version is waiting for a human to ratify it.
      </p>
    );
  }
  if (phase === "voting") return <p className="text-xs text-zinc-500">{state.readyRule}</p>;
  if (phase === "ratified" && state.decision) {
    return (
      <p className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400">
        <FileText className="size-4" aria-hidden />
        Decision {String(state.decision.number).padStart(4, "0")} in {state.decision.projectName}:{" "}
        <code className="text-xs break-all">{state.decision.filePath}</code>
      </p>
    );
  }
  if (state.proposal.humanNote) {
    return <p className="text-zinc-600 dark:text-zinc-400">Operator note: {state.proposal.humanNote}</p>;
  }
  return null;
}
