// Decision file naming. Dependency-free so the dashboard can preview the exact path before ratifying.

export function padNumber(n: number): string {
  return String(n).padStart(4, "0");
}

export function slugify(title: string): string {
  const slug = title
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/, "");
  return slug || "decision";
}

/** Path of a decision file relative to its project, e.g. docs/decisions/0007-cache-ttls.md. */
export function decisionFilePath(decisionsDir: string, number: number, title: string): string {
  return `${decisionsDir}/${padNumber(number)}-${slugify(title)}.md`;
}
