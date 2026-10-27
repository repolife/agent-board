import { useEffect, useId, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, X } from "lucide-react";
import { decisionFilePath, padNumber } from "@agent-board/mcp-server/decision-format";
import {
  ApiError,
  fetchProjects,
  ratifyProposal,
  rejectProposal,
  type ProjectSummary,
  type ProposalState,
  type RatifyResult,
  type Thread,
} from "../api";

interface Props {
  mode: "ratify" | "reject" | null;
  state: ProposalState;
  thread: Thread;
  onClose: () => void;
  /** Called after a successful write, so the thread and sidebar can refresh. */
  onDone: () => void;
}

/** The operator's two actions on a proposal: ratify it into a decision file, or reject it with a note. */
export function ResolveDialog({ mode, state, thread, onClose, onDone }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (mode && !dialog.open) dialog.showModal();
    if (!mode && dialog.open) dialog.close();
  }, [mode]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === e.currentTarget && onClose()}
      aria-labelledby={titleId}
      className="m-auto max-h-[88dvh] w-[calc(100%-2rem)] max-w-lg rounded-xl border border-zinc-200 bg-white p-0 text-zinc-900 shadow-xl backdrop:bg-zinc-950/50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
    >
      {/* Remounted per opening so each starts from a clean form. */}
      {mode === "ratify" && (
        <RatifyForm
          key={state.proposal.id}
          titleId={titleId}
          state={state}
          thread={thread}
          onClose={onClose}
          onDone={onDone}
        />
      )}
      {mode === "reject" && (
        <RejectForm key={state.proposal.id} titleId={titleId} state={state} onClose={onClose} onDone={onDone} />
      )}
    </dialog>
  );
}

interface FormProps {
  titleId: string;
  state: ProposalState;
  onClose: () => void;
  onDone: () => void;
}

function RatifyForm({ titleId, state, thread, onClose, onDone }: FormProps & { thread: Thread }) {
  const [projects, setProjects] = useState<ProjectSummary[]>();
  // A replacement must be filed in the same project as the decision it replaces; the server enforces it too.
  const lockedProjectId = state.supersedes?.projectId;
  const [projectId, setProjectId] = useState(lockedProjectId ?? thread.project?.id ?? "");
  const [note, setNote] = useState("");
  const [override, setOverride] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [result, setResult] = useState<RatifyResult>();

  useEffect(() => {
    fetchProjects().then(
      (list) => {
        setProjects(list);
        if (!projectId && list.length === 1) setProjectId(list[0].id);
      },
      (e: Error) => setError(e.message),
    );
    // Load once per opening; projectId only seeds the default.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const project = projects?.find((p) => p.id === projectId);
  // Numbers are assigned max + 1 per project and decisions are never deleted, so this matches the server.
  const preview = project
    ? decisionFilePath(project.decisionsDir, project.decisionCount + 1, state.proposal.title)
    : null;
  const needsOverride = !state.ready;
  const canSubmit = !!project && (!needsOverride || override) && !busy;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    setError(undefined);
    try {
      setResult(await ratifyProposal(state.proposal.id, { projectId, note: note.trim() || undefined, override }));
      onDone();
    } catch (err) {
      setError((err as Error).message);
      // Votes can change while the dialog is open; make the operator confirm explicitly.
      if (err instanceof ApiError && err.code === "not_ready") setOverride(false);
    } finally {
      setBusy(false);
    }
  };

  if (result) {
    return (
      <div className="p-5">
        <Header titleId={titleId} title="Decision ratified" onClose={onClose} />
        <div className="mt-4 space-y-3 text-sm">
          <p className="flex items-start gap-2 text-emerald-700 dark:text-emerald-400">
            <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span>
              Wrote <code className="break-all">{result.absolutePath}</code>
            </span>
          </p>
          {state.supersedes && result.warnings.length === 0 && (
            <p className="text-zinc-600 dark:text-zinc-400">
              Marked decision {padNumber(state.supersedes.number)} as superseded.
            </p>
          )}
          {result.warnings.map((w) => (
            <Warning key={w}>{w}</Warning>
          ))}
          {result.index.written ? (
            <p className="text-zinc-600 dark:text-zinc-400">
              Updated the index at <code className="break-all">{result.index.path}</code>.
            </p>
          ) : (
            <Warning>{result.index.warning}</Warning>
          )}
          <p className="text-zinc-500">The files aren't committed. Review and commit them in the project's repo.</p>
        </div>
        <div className="mt-5 flex justify-end">
          <Button variant="primary" onClick={onClose}>
            Done
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="p-5">
      <Header titleId={titleId} title={`Ratify v${state.proposal.version}`} onClose={onClose} />
      <p className="mt-1 text-sm text-zinc-500">“{state.proposal.title}” becomes a decision record in the project.</p>

      <div className="mt-4 space-y-4 text-sm">
        {projects?.length === 0 ? (
          <Warning>
            No projects are registered. Add one in a terminal, then reopen this dialog:
            <code className="mt-1 block">agent-board project add /path/to/your/repo</code>
          </Warning>
        ) : (
          <label className="block">
            <span className="mb-1 block font-medium">Project</span>
            <select
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              disabled={!projects || !!lockedProjectId}
              className="w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 dark:border-zinc-700 dark:bg-zinc-950"
            >
              <option value="" disabled>
                {projects ? "Choose a project…" : "Loading…"}
              </option>
              {projects?.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            {project && preview && (
              <span className="mt-1 block text-xs break-all text-zinc-500">
                Writes{" "}
                <code>
                  {project.path}/{preview}
                </code>
                {state.supersedes && (
                  <>
                    {" "}
                    and marks decision {padNumber(state.supersedes.number)} “{state.supersedes.title}” as superseded.
                    The project is fixed because a decision can only be replaced within its own project.
                  </>
                )}
              </span>
            )}
          </label>
        )}

        <label className="block">
          <span className="mb-1 block font-medium">
            Note <span className="font-normal text-zinc-500">(optional, recorded in the file)</span>
          </span>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            className="w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 dark:border-zinc-700 dark:bg-zinc-950"
          />
        </label>

        {needsOverride && (
          <Warning>
            This version hasn't met the agreement rule ({state.approvals} approval{state.approvals === 1 ? "" : "s"},{" "}
            {state.rejections} rejection{state.rejections === 1 ? "" : "s"}).
            <label className="mt-2 flex items-center gap-2 font-medium">
              <input type="checkbox" checked={override} onChange={(e) => setOverride(e.target.checked)} />
              Ratify anyway; the file will say so
            </label>
          </Warning>
        )}

        {error && <p className="text-red-600">{error}</p>}
      </div>

      <div className="mt-5 flex justify-end gap-2">
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="primary" type="submit" disabled={!canSubmit}>
          {busy ? "Ratifying…" : "Ratify and write file"}
        </Button>
      </div>
    </form>
  );
}

function RejectForm({ titleId, state, onClose, onDone }: FormProps) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!note.trim() || busy) return;
    setBusy(true);
    setError(undefined);
    try {
      await rejectProposal(state.proposal.id, note.trim());
      onDone();
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="p-5">
      <Header titleId={titleId} title={`Reject v${state.proposal.version}`} onClose={onClose} />
      <p className="mt-1 text-sm text-zinc-500">
        The proposal closes and your note is posted to the thread, so the agents can respond with a new proposal.
      </p>
      <label className="mt-4 block text-sm">
        <span className="mb-1 block font-medium">Why?</span>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          required
          autoFocus
          className="w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 dark:border-zinc-700 dark:bg-zinc-950"
        />
      </label>
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      <div className="mt-5 flex justify-end gap-2">
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="danger" type="submit" disabled={!note.trim() || busy}>
          {busy ? "Rejecting…" : "Reject proposal"}
        </Button>
      </div>
    </form>
  );
}

function Header({ titleId, title, onClose }: { titleId: string; title: string; onClose: () => void }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <h2 id={titleId} className="font-semibold tracking-tight">
        {title}
      </h2>
      <button
        type="button"
        onClick={onClose}
        className="-mt-1 -mr-1 rounded-md p-1 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
        aria-label="Close"
      >
        <X className="size-5" />
      </button>
    </div>
  );
}

function Warning({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-amber-900 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-200">
      <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

// Literal class strings so Tailwind can see them at build time.
const BUTTON_VARIANTS = {
  default:
    "border border-zinc-300 text-zinc-700 enabled:hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:enabled:hover:bg-zinc-800",
  primary: "bg-emerald-600 text-white enabled:hover:bg-emerald-700",
  danger: "bg-rose-600 text-white enabled:hover:bg-rose-700",
};

export function Button({
  variant = "default",
  type = "button",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: keyof typeof BUTTON_VARIANTS }) {
  return (
    <button
      {...props}
      type={type}
      className={`rounded-md px-3 py-1.5 text-sm font-medium disabled:opacity-50 ${BUTTON_VARIANTS[variant]} ${props.className ?? ""}`}
    />
  );
}
