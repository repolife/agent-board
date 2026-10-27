import type { ThreadType } from "@agent-board/mcp-server/thread-types";

export type { ThreadType };

export interface TopicSummary {
  id: string;
  title: string;
  type: ThreadType;
  projectId: string | null;
  projectName: string | null;
  archivedAt: string | null;
  createdAt: string;
  postCount: number;
  lastActivityAt: string | null;
  /** Set while the thread has an open proposal. */
  proposal: { version: number; status: "voting" | "ready" } | null;
}

export interface Topic {
  id: string;
  title: string;
  type: ThreadType;
  projectId: string | null;
  archivedAt: string | null;
  createdAt: string;
}

export interface Post {
  id: string;
  topicId: string;
  company: string;
  model: string;
  content: string;
  /** "event" posts are written by the board itself, e.g. "Proposal v2 opened". */
  kind: "message" | "event";
  replyToPostId: string | null;
  createdAt: string;
}

export type ProposalStatus = "open" | "revised" | "withdrawn" | "ratified" | "rejected";

export interface ProposalState {
  proposal: {
    id: string;
    version: number;
    title: string;
    content: string;
    changeSummary: string | null;
    proposedByCompany: string;
    proposedByModel: string;
    status: ProposalStatus;
    humanNote: string | null;
    createdAt: string;
  };
  votes: { company: string; model: string; vote: "approve" | "reject"; rationale: string; updatedAt: string }[];
  pendingVoters: { company: string; model: string }[];
  approvals: number;
  rejections: number;
  ready: boolean;
  readyRule: string;
  decision: { id: string; number: number; filePath: string; projectName: string } | null;
  /** The ratified decision this proposal would replace, if any. */
  supersedes: {
    id: string;
    number: number;
    title: string;
    status: "accepted" | "superseded";
    filePath: string;
    topicId: string;
    projectId: string;
    projectName: string;
  } | null;
  history: {
    id: string;
    version: number;
    title: string;
    content: string;
    status: ProposalStatus;
    changeSummary: string | null;
    proposedByCompany: string;
    proposedByModel: string;
    createdAt: string;
  }[];
}

export interface TopicRef {
  id: string;
  title: string;
  type: ThreadType;
}

export interface PostRef {
  id: string;
  topicId: string;
  topicTitle: string;
  company: string;
  model: string;
}

export interface Thread {
  topic: Topic;
  project: { id: string; name: string } | null;
  posts: Post[];
  proposal: ProposalState | null;
  /** Everything this thread's posts link to, keyed by ID. Missing keys are dead links. */
  links: { topics: Record<string, TopicRef>; posts: Record<string, PostRef> };
}

export interface Setup {
  nodePath: string;
  binPath: string;
  dbPath: string;
  platform: string;
  wslDistro: string | null;
  docker: boolean;
}

export interface ProjectSummary {
  id: string;
  name: string;
  path: string;
  decisionsDir: string;
  topicCount: number;
  decisionCount: number;
}

export interface DecisionSummary {
  id: string;
  number: number;
  title: string;
  status: "accepted" | "superseded";
  filePath: string;
  topicId: string;
  projectName: string;
  ratifiedAt: string;
  supersededBy: string | null;
  supersededByNumber: number | null;
  supersedesNumber: number | null;
}

export interface RatifyResult {
  decision: { id: string; number: number; filePath: string };
  absolutePath: string;
  index: { path: string; written: boolean; warning?: string };
  /** Problems updating the superseded decision's file, which didn't stop the ratification. */
  warnings: string[];
}

export class NotFoundError extends Error {}

/** A write the server refused; `code` is "not_ready" when the operator can confirm and retry. */
export class ApiError extends Error {
  readonly code: string | undefined;
  constructor(message: string, code?: string) {
    super(message);
    this.code = code;
  }
}

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(path);
  if (res.status === 404) throw new NotFoundError(path);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json() as Promise<T>;
}

export const fetchTopics = () => getJson<TopicSummary[]>("/api/topics");
export const fetchThread = (id: string) => getJson<Thread>(`/api/topics/${encodeURIComponent(id)}`);
export const fetchSetup = () => getJson<Setup>("/api/setup");
export const fetchProjects = () => getJson<ProjectSummary[]>("/api/projects");
export const fetchDecisions = () => getJson<DecisionSummary[]>("/api/decisions");

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    // The server refuses writes without this header, which other sites can't send cross-origin.
    headers: { "Content-Type": "application/json", "X-Agent-Board": "1" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data.error ?? `${res.status} ${res.statusText}`, data.code);
  return data as T;
}

export const ratifyProposal = (proposalId: string, body: { projectId?: string; note?: string; override?: boolean }) =>
  postJson<RatifyResult>(`/api/proposals/${encodeURIComponent(proposalId)}/ratify`, body);

export const archiveTopic = (topicId: string) =>
  postJson<{ topicId: string; withdrewProposal: boolean }>(`/api/topics/${encodeURIComponent(topicId)}/archive`, {});

export const unarchiveTopic = (topicId: string) =>
  postJson<{ topicId: string }>(`/api/topics/${encodeURIComponent(topicId)}/unarchive`, {});

export const rejectProposal = (proposalId: string, note: string) =>
  postJson<{ proposalId: string }>(`/api/proposals/${encodeURIComponent(proposalId)}/reject`, { note });
