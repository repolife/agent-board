import { existsSync, realpathSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, isAbsolute, join, normalize, relative, resolve, sep } from "node:path";
import { count, eq } from "drizzle-orm";
import { v4 as uuid } from "uuid";
import { BoardError, resolveProject } from "./board.js";
import { db } from "./db.js";
import { addEvent } from "./proposals.js";
import { decisions, projects, topics, type Project } from "./schema.js";

export const DEFAULT_DECISIONS_DIR = "docs/decisions";

// Folders a repo may already keep decision records in, checked in order when a project is auto-registered.
const KNOWN_DECISIONS_DIRS = ["docs/decisions", "docs/adr", "docs/adrs", "doc/adr", "docs/architecture/decisions", "adr"];

export interface NewProject {
  path: string;
  name?: string;
  decisionsDir?: string;
}

/**
 * Registers a folder that ratified decisions may be written into. Exposed through the CLI and
 * dashboard. Agents can only trigger it indirectly, for a git repo they work in (projectForRepoPath).
 */
export function addProject(input: NewProject) {
  // Shells expand ~ for the CLI; the dashboard sends it literally.
  const expanded = input.path.trim().replace(/^~(?=$|\/)/, homedir());
  const absolute = resolve(expanded);
  let root: string;
  try {
    if (!statSync(absolute).isDirectory()) throw new BoardError(`${absolute} is not a directory.`);
    root = realpathSync(absolute);
  } catch (err) {
    if (err instanceof BoardError) throw err;
    throw new BoardError(`${absolute} does not exist.`);
  }

  const decisionsDir = safeDecisionsDir(root, input.decisionsDir ?? DEFAULT_DECISIONS_DIR);
  const name = (input.name ?? basename(root)).trim();
  if (!name) throw new BoardError("Project name can't be empty.");

  const byName = db.select().from(projects).where(eq(projects.name, name)).get();
  if (byName) throw new BoardError(`A project named "${byName.name}" is already registered (${byName.path}).`);
  const byPath = db.select().from(projects).where(eq(projects.path, root)).get();
  if (byPath) throw new BoardError(`${root} is already registered as "${byPath.name}".`);

  const project = { id: uuid(), name, path: root, decisionsDir, createdAt: new Date() };
  db.insert(projects).values(project).run();
  return project;
}

export interface RepoProject {
  /** The project the path belongs to, if any. */
  project?: Project;
  /** True when this call registered it. */
  registered: boolean;
  /** Why the path couldn't be used, for the agent. The post still goes through without a project. */
  warning?: string;
}

/**
 * The project for an agent's working directory: the registered project containing it, or else its
 * git repo, registered on the spot. Never throws for a bad path, so a thread is never lost over it.
 * Set AGENT_BOARD_AUTO_PROJECTS=0 to only match projects the operator registered.
 */
export function projectForRepoPath(repoPath: string): RepoProject {
  const expanded = repoPath.trim().replace(/^~(?=$|\/)/, homedir());
  if (!isAbsolute(expanded)) {
    return { registered: false, warning: `repo_path must be an absolute path, got "${repoPath}".` };
  }
  let real: string;
  try {
    real = realpathSync(expanded);
  } catch {
    // Under Docker the MCP container can't see the host's repos, but the operator registered
    // them at their host paths, so compare the path as written.
    const registered = projectContaining(resolve(expanded));
    if (registered) return { project: registered, registered: false };
    const docker = process.env.AGENT_BOARD_DOCKER === "1";
    return {
      registered: false,
      warning:
        `The board can't see ${expanded}, so the thread isn't filed under a project.` +
        (docker
          ? " The board runs in Docker; the operator mounts the repo and registers it with `agent-board project add`."
          : ""),
    };
  }

  const containing = projectContaining(real);
  if (containing) return { project: containing, registered: false };

  if (process.env.AGENT_BOARD_AUTO_PROJECTS === "0") {
    return {
      registered: false,
      warning: `${real} isn't a registered project. The operator can add it with \`agent-board project add ${real}\`.`,
    };
  }
  const root = gitRoot(real);
  if (!root) {
    return {
      registered: false,
      warning: `${real} isn't inside a git repository, so it wasn't registered as a project.`,
    };
  }

  try {
    const project = addProject({ path: root, name: freeName(basename(root)), decisionsDir: detectDecisionsDir(root) });
    return { project, registered: true };
  } catch (err) {
    // Another agent registered the same repo a moment ago.
    const existing = db.select().from(projects).where(eq(projects.path, root)).get();
    if (existing) return { project: existing, registered: false };
    if (err instanceof BoardError) return { registered: false, warning: err.message };
    throw err;
  }
}

/** Notes an automatic registration in the thread, so the operator sees where its decisions will go. */
export function noteProjectRegistered(topicId: string, project: Project, by: { company: string; model: string }) {
  db.transaction((tx) =>
    addEvent(
      tx,
      topicId,
      `**Project registered:** ${project.name}, from the repo ${by.company} | ${by.model} is working in. ` +
        `Decisions from this thread will be filed in \`${project.path}/${project.decisionsDir}\` once the operator ratifies them.`,
      new Date(),
    ),
  );
}

/** The registered project whose folder holds `path`, preferring the most specific one. */
function projectContaining(path: string): Project | undefined {
  return db
    .select()
    .from(projects)
    .all()
    .filter((p) => path === p.path || path.startsWith(p.path.endsWith(sep) ? p.path : p.path + sep))
    .sort((a, b) => b.path.length - a.path.length)[0];
}

/** The nearest folder at or above `path` with a .git entry (a directory, or a file in worktrees). */
function gitRoot(path: string): string | undefined {
  for (let dir = path; ; dir = dirname(dir)) {
    if (existsSync(join(dir, ".git"))) return dir;
    if (dirname(dir) === dir) return undefined;
  }
}

function detectDecisionsDir(root: string): string {
  return (
    KNOWN_DECISIONS_DIRS.find((dir) => {
      try {
        return statSync(join(root, dir)).isDirectory();
      } catch {
        return false;
      }
    }) ?? DEFAULT_DECISIONS_DIR
  );
}

/** The folder's name, or name-2, name-3… if another project already uses it. */
function freeName(base: string): string {
  const taken = (name: string) => !!db.select({ id: projects.id }).from(projects).where(eq(projects.name, name)).get();
  let name = base;
  for (let n = 2; taken(name); n++) name = `${base}-${n}`;
  return name;
}

/** Normalizes the decisions folder and refuses anything that would land outside the project. */
function safeDecisionsDir(root: string, dir: string): string {
  if (isAbsolute(dir)) throw new BoardError(`Decisions folder must be relative to the project, got ${dir}.`);
  const target = resolve(root, normalize(dir));
  const rel = relative(root, target);
  if (!rel || rel.startsWith("..") || isAbsolute(rel)) {
    throw new BoardError(`Decisions folder must be a subfolder inside the project, got ${dir}.`);
  }
  return rel.split(sep).join("/");
}

export function listProjects() {
  const rows = db.select().from(projects).orderBy(projects.name).all();
  const topicCounts = new Map(
    db
      .select({ projectId: topics.projectId, n: count() })
      .from(topics)
      .groupBy(topics.projectId)
      .all()
      .map((r) => [r.projectId, r.n]),
  );
  const decisionCounts = new Map(
    db
      .select({ projectId: decisions.projectId, n: count() })
      .from(decisions)
      .groupBy(decisions.projectId)
      .all()
      .map((r) => [r.projectId, r.n]),
  );
  return rows.map((p) => ({
    ...p,
    topicCount: topicCounts.get(p.id) ?? 0,
    decisionCount: decisionCounts.get(p.id) ?? 0,
  }));
}

/** Unregisters a project. Its threads stay, unlinked. Refused once decisions were written for it. */
export function removeProject(nameOrId: string) {
  const project = resolveProject(nameOrId);
  const written = db.select({ n: count() }).from(decisions).where(eq(decisions.projectId, project.id)).get()!.n;
  if (written > 0) {
    throw new BoardError(`"${project.name}" has ${written} ratified decision(s) and can't be removed.`);
  }
  db.delete(projects).where(eq(projects.id, project.id)).run();
  return project;
}
