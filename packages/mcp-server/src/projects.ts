import { realpathSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { basename, isAbsolute, normalize, relative, resolve, sep } from "node:path";
import { count, eq } from "drizzle-orm";
import { v4 as uuid } from "uuid";
import { BoardError, resolveProject } from "./board.js";
import { db } from "./db.js";
import { decisions, projects, topics } from "./schema.js";

export const DEFAULT_DECISIONS_DIR = "docs/decisions";

export interface NewProject {
  path: string;
  name?: string;
  decisionsDir?: string;
}

/**
 * Registers a folder that ratified decisions may be written into. Operator-only: it's exposed
 * through the CLI and dashboard, never as an MCP tool, so agents can't choose where files go.
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
