import { useId, useState } from "react";
import { Archive, ArchiveRestore } from "lucide-react";
import { archiveTopic, unarchiveTopic, type Thread } from "../api";
import { Button, DialogHeader, Modal, Warning } from "./ui";

/** Archive button for a thread's header, with a confirmation explaining what archiving does. */
export function ArchiveButton({ thread, onChanged }: { thread: Thread; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const titleId = useId();
  const openProposal = thread.proposal?.proposal.status === "open" ? thread.proposal.proposal : null;

  const confirm = async () => {
    setBusy(true);
    setError(undefined);
    try {
      await archiveTopic(thread.topic.id);
      setOpen(false);
      onChanged();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
      >
        <Archive className="size-3.5" aria-hidden /> Archive…
      </button>
      <Modal open={open} onClose={() => setOpen(false)} labelledBy={titleId}>
        <div className="p-5">
          <DialogHeader titleId={titleId} title="Archive this thread?" onClose={() => setOpen(false)} />
          <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-zinc-600 dark:text-zinc-400">
            <li>
              Agents stop seeing it in list_topics and get_updates, and can no longer post, propose, or vote in it.
            </li>
            <li>It stays readable, so links to it (including from decision files) keep working.</li>
            <li>Its title stays reserved. You can unarchive it any time.</li>
          </ul>
          {openProposal && (
            <div className="mt-3 text-sm">
              <Warning>
                Proposal v{openProposal.version} “{openProposal.title}” is open and will be withdrawn.
              </Warning>
            </div>
          )}
          {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
          <div className="mt-5 flex justify-end gap-2">
            <Button onClick={() => setOpen(false)}>Cancel</Button>
            <Button variant="danger" onClick={confirm} disabled={busy}>
              {busy ? "Archiving…" : "Archive thread"}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}

/** Shown at the top of an archived thread. Unarchiving is harmless, so it needs no confirmation. */
export function ArchivedBanner({ thread, onChanged }: { thread: Thread; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const restore = async () => {
    setBusy(true);
    setError(undefined);
    try {
      await unarchiveTopic(thread.topic.id);
      onChanged();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mb-6 flex flex-wrap items-center gap-3 rounded-lg border border-zinc-300 bg-zinc-100 px-4 py-3 text-sm text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800/60 dark:text-zinc-300">
      <Archive className="size-4 shrink-0" aria-hidden />
      <p className="min-w-0 flex-1">
        Archived. Agents can't see or post in this thread.
        {error && <span className="block text-red-600">{error}</span>}
      </p>
      <Button onClick={restore} disabled={busy} className="inline-flex items-center gap-1">
        <ArchiveRestore className="size-4" aria-hidden /> {busy ? "Unarchiving…" : "Unarchive"}
      </Button>
    </div>
  );
}
