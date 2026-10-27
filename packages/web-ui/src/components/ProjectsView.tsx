import { useEffect, useId, useState } from "react";
import { ArrowLeft, FolderGit2, Plus, Trash2 } from "lucide-react";
import { addProject, fetchProjects, fetchSetup, removeProject, type ProjectSummary, type Setup } from "../api";
import { usePolling } from "../hooks/usePolling";
import { Button, DialogHeader, Modal } from "./ui";

/** Registering the folders ratified decisions are written into. The CLI (`agent-board project`) does the same. */
export function ProjectsView() {
  const projects = usePolling("projects", fetchProjects);
  const [setup, setSetup] = useState<Setup>();
  useEffect(() => {
    fetchSetup().then(setSetup, () => {});
  }, []);

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-8">
      <a href="#/" className="mb-4 inline-flex items-center gap-1 text-sm text-zinc-500 md:hidden">
        <ArrowLeft className="size-4" aria-hidden /> Threads
      </a>
      <h2 className="text-2xl font-semibold tracking-tight">Projects</h2>
      <p className="mt-1 text-sm text-zinc-500">
        Folders on this machine that ratified decisions are written into. Agents can file threads under a project but
        can't add or change them.
      </p>

      <AddProjectForm docker={setup?.docker ?? false} onAdded={projects.refresh} />

      <div className="mt-8">
        {projects.error && !projects.data && (
          <p className="text-sm text-red-600">Couldn't load projects: {projects.error.message}</p>
        )}
        {projects.data?.length === 0 && <p className="text-sm text-zinc-500">No projects registered yet.</p>}
        {projects.data && projects.data.length > 0 && (
          <ul className="divide-y divide-zinc-200 overflow-hidden rounded-lg border border-zinc-200 bg-white dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-900">
            {projects.data.map((p) => (
              <ProjectRow key={p.id} project={p} onRemoved={projects.refresh} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function AddProjectForm({ docker, onAdded }: { docker: boolean; onAdded: () => void }) {
  const [path, setPath] = useState("");
  const [name, setName] = useState("");
  const [dir, setDir] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [added, setAdded] = useState<string>();

  // Mirrors the server's default name: the folder's own name.
  const defaultName = path.trim().replace(/\/+$/, "").split("/").pop() || "my-app";

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!path.trim() || busy) return;
    setBusy(true);
    setError(undefined);
    setAdded(undefined);
    try {
      const project = await addProject({ path, name: name || undefined, decisionsDir: dir || undefined });
      setAdded(`Registered “${project.name}”. Decisions go to ${project.path}/${project.decisionsDir}.`);
      setPath("");
      setName("");
      setDir("");
      onAdded();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const input =
    "w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 font-mono text-sm dark:border-zinc-700 dark:bg-zinc-950";

  return (
    <form
      onSubmit={submit}
      className="mt-6 space-y-3 rounded-lg border border-zinc-200 bg-white p-4 text-sm dark:border-zinc-800 dark:bg-zinc-900"
    >
      <h3 className="font-medium">Add a project</h3>
      <label className="block">
        <span className="mb-1 block text-zinc-600 dark:text-zinc-400">Folder</span>
        <input
          value={path}
          onChange={(e) => setPath(e.target.value)}
          placeholder={docker ? "/projects/my-app" : "~/dev/my-app"}
          required
          spellCheck={false}
          className={input}
        />
        {docker && (
          <span className="mt-1 block text-xs text-zinc-500">
            The board runs in Docker, so this is a path inside the container. Mount the repo first, e.g.{" "}
            <code>-v ~/dev/my-app:/projects/my-app</code>.
          </span>
        )}
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-zinc-600 dark:text-zinc-400">Name (optional)</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder={defaultName} className={input} />
        </label>
        <label className="block">
          <span className="mb-1 block text-zinc-600 dark:text-zinc-400">Decisions folder (optional)</span>
          <input
            value={dir}
            onChange={(e) => setDir(e.target.value)}
            placeholder="docs/decisions"
            spellCheck={false}
            className={input}
          />
        </label>
      </div>
      {error && <p className="text-red-600">{error}</p>}
      {added && <p className="text-emerald-700 dark:text-emerald-400">{added}</p>}
      <Button
        variant="primary"
        type="submit"
        disabled={!path.trim() || busy}
        className="inline-flex items-center gap-1"
      >
        <Plus className="size-4" aria-hidden /> {busy ? "Adding…" : "Add project"}
      </Button>
    </form>
  );
}

function ProjectRow({ project, onRemoved }: { project: ProjectSummary; onRemoved: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const titleId = useId();
  const locked = project.decisionCount > 0;

  const remove = async () => {
    setBusy(true);
    setError(undefined);
    try {
      await removeProject(project.id);
      setConfirming(false);
      onRemoved();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className="flex items-start gap-3 px-4 py-3">
      <FolderGit2 className="mt-0.5 size-4 shrink-0 text-zinc-500" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="font-medium">{project.name}</p>
        <p className="mt-0.5 font-mono text-xs break-all text-zinc-500">
          {project.path}/{project.decisionsDir}
        </p>
        <p className="mt-0.5 text-xs text-zinc-500">
          {project.topicCount} {project.topicCount === 1 ? "thread" : "threads"} · {project.decisionCount}{" "}
          {project.decisionCount === 1 ? "decision" : "decisions"}
        </p>
      </div>
      <button
        type="button"
        onClick={() => setConfirming(true)}
        disabled={locked}
        title={locked ? "Projects with ratified decisions can't be removed" : "Remove project"}
        aria-label={`Remove ${project.name}`}
        className="rounded-md p-1.5 text-zinc-500 enabled:hover:bg-zinc-100 enabled:hover:text-rose-600 disabled:opacity-40 dark:enabled:hover:bg-zinc-800"
      >
        <Trash2 className="size-4" />
      </button>

      <Modal open={confirming} onClose={() => setConfirming(false)} labelledBy={titleId}>
        <div className="p-5">
          <DialogHeader titleId={titleId} title={`Remove “${project.name}”?`} onClose={() => setConfirming(false)} />
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            The board forgets this folder; nothing on disk is touched. Its {project.topicCount}{" "}
            {project.topicCount === 1 ? "thread stays" : "threads stay"} on the board without a project.
          </p>
          {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
          <div className="mt-5 flex justify-end gap-2">
            <Button onClick={() => setConfirming(false)}>Cancel</Button>
            <Button variant="danger" onClick={remove} disabled={busy}>
              {busy ? "Removing…" : "Remove project"}
            </Button>
          </div>
        </div>
      </Modal>
    </li>
  );
}
