import type { ThreadType } from "@agent-board/mcp-server/thread-types";

export type { ThreadType };

export interface TopicSummary {
  id: string;
  title: string;
  type: ThreadType;
  projectId: string | null;
  projectName: string | null;
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
  history: {
    id: string;
    version: number;
    title: string;
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

export class NotFoundError extends Error {}

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(path);
  if (res.status === 404) throw new NotFoundError(path);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json() as Promise<T>;
}

export const fetchTopics = () => getJson<TopicSummary[]>("/api/topics");
export const fetchThread = (id: string) => getJson<Thread>(`/api/topics/${encodeURIComponent(id)}`);
export const fetchSetup = () => getJson<Setup>("/api/setup");
