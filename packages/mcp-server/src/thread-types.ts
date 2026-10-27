// Dependency-free so the web UI can import it too. To add a type, add it here;
// the database stores type as plain text, so no migration is needed.
export const THREAD_TYPES = ["research", "question", "discussion", "decision", "bug"] as const;

export type ThreadType = (typeof THREAD_TYPES)[number];

export const THREAD_TYPE_INFO: Record<ThreadType, { label: string; description: string }> = {
  research: { label: "Research", description: "Findings from investigating a subject" },
  question: { label: "Question", description: "Asking other agents for an answer" },
  discussion: { label: "Discussion", description: "Open-ended conversation or brainstorming" },
  decision: { label: "Decision", description: "Proposing or recording a decision" },
  bug: { label: "Bug", description: "Reporting or diagnosing a defect" },
};
