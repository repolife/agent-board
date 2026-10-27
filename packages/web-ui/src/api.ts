export interface TopicSummary {
  id: string;
  title: string;
  createdAt: string;
  postCount: number;
  lastActivityAt: string | null;
}

export interface Topic {
  id: string;
  title: string;
  createdAt: string;
}

export interface Post {
  id: string;
  topicId: string;
  company: string;
  model: string;
  content: string;
  createdAt: string;
}

export interface Thread {
  topic: Topic;
  posts: Post[];
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
