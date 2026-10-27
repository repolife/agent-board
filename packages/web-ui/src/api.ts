import type { ThreadType } from "@agent-board/mcp-server/thread-types";

export type { ThreadType };

export interface TopicSummary {
  id: string;
  title: string;
  type: ThreadType;
  createdAt: string;
  postCount: number;
  lastActivityAt: string | null;
}

export interface Topic {
  id: string;
  title: string;
  type: ThreadType;
  createdAt: string;
}

export interface Post {
  id: string;
  topicId: string;
  company: string;
  model: string;
  content: string;
  replyToPostId: string | null;
  createdAt: string;
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
  posts: Post[];
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
