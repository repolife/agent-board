import { ArrowLeft, FileText, FolderGit2 } from "lucide-react";
import { padNumber } from "@agent-board/mcp-server/decision-format";
import { fetchDecisions, fetchProjects } from "../api";
import { PROJECTS_HREF, topicHref } from "../hooks/useHashRoute";
import { usePolling } from "../hooks/usePolling";
import { absoluteTime } from "../time";

/** Every ratified decision, grouped by project, with where its file lives. */
export function DecisionsView() {
  const decisions = usePolling("decisions", fetchDecisions);
  const projects = usePolling("projects", fetchProjects);

  const error = decisions.error ?? projects.error;
  if (error && !(decisions.data && projects.data)) {
    return <p className="p-8 text-sm text-red-600">Couldn't load decisions: {error.message}</p>;
  }
  if (!decisions.data || !projects.data) return <p className="p-8 text-sm text-zinc-500">Loading…</p>;

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-8">
      <a href="#/" className="mb-4 inline-flex items-center gap-1 text-sm text-zinc-500 md:hidden">
        <ArrowLeft className="size-4" aria-hidden /> Threads
      </a>
      <h2 className="text-2xl font-semibold tracking-tight">Decisions</h2>
      <p className="mt-1 text-sm text-zinc-500">
        Proposals the agents agreed on and you ratified. Each is a Markdown file in its project's repo.
      </p>

      {projects.data.length === 0 && (
        <div className="mt-6 rounded-lg border border-dashed border-zinc-300 p-6 text-sm text-zinc-600 dark:border-zinc-700 dark:text-zinc-400">
          <p className="font-medium text-zinc-900 dark:text-zinc-100">No projects registered yet</p>
          <p className="mt-1">
            Decisions are filed into a project folder.{" "}
            <a href={PROJECTS_HREF} className="font-medium text-zinc-900 underline dark:text-zinc-100">
              Add a project
            </a>{" "}
            to get started.
          </p>
        </div>
      )}

      <div className="mt-6 space-y-8">
        {projects.data.map((project) => {
          const rows = decisions.data!.filter((d) => d.projectName === project.name);
          return (
            <section key={project.id} aria-labelledby={`project-${project.id}`}>
              <h3 id={`project-${project.id}`} className="flex items-center gap-1.5 font-semibold">
                <FolderGit2 className="size-4 text-zinc-500" aria-hidden /> {project.name}
              </h3>
              <p className="mt-0.5 text-xs break-all text-zinc-500">
                {project.path}/{project.decisionsDir}
              </p>
              {rows.length === 0 ? (
                <p className="mt-3 text-sm text-zinc-500">No decisions yet.</p>
              ) : (
                <ol className="mt-3 divide-y divide-zinc-200 overflow-hidden rounded-lg border border-zinc-200 bg-white dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-900">
                  {rows.map((d) => (
                    <li key={d.id} className={`flex gap-3 px-4 py-3 ${d.status === "superseded" ? "opacity-60" : ""}`}>
                      <span className="pt-0.5 font-mono text-xs text-zinc-500 tabular-nums">{padNumber(d.number)}</span>
                      <div className="min-w-0 flex-1">
                        <a href={topicHref(d.topicId)} className="font-medium hover:underline">
                          {d.title}
                        </a>
                        {d.supersedesNumber && (
                          <p className="mt-0.5 text-xs text-zinc-500">Replaces {padNumber(d.supersedesNumber)}</p>
                        )}
                        <p className="mt-0.5 flex items-center gap-1 text-xs text-zinc-500">
                          <FileText className="size-3.5 shrink-0" aria-hidden />
                          <code className="truncate">{d.filePath}</code>
                        </p>
                      </div>
                      <div className="shrink-0 text-right text-xs">
                        <span
                          className={`rounded-full px-2 py-0.5 font-medium ${
                            d.status === "accepted"
                              ? "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200"
                              : "bg-zinc-200 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
                          }`}
                        >
                          {d.supersededByNumber ? `superseded by ${padNumber(d.supersededByNumber)}` : d.status}
                        </span>
                        <time className="mt-1 block text-zinc-500" dateTime={d.ratifiedAt}>
                          {absoluteTime(d.ratifiedAt)}
                        </time>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
