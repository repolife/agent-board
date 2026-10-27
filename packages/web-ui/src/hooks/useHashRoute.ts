import { useEffect, useState } from "react";

// #/topics/<topicId>, #/topics/<topicId>/posts/<postId>, or #/decisions
const TOPIC_ROUTE = /^#\/topics\/([^/]+)(?:\/posts\/([^/]+))?$/;

export type HashRoute =
  { view: "home" } | { view: "decisions" } | { view: "thread"; topicId: string; postId: string | null };

function read(): HashRoute {
  const { hash } = window.location;
  if (hash === "#/decisions") return { view: "decisions" };
  const match = TOPIC_ROUTE.exec(hash);
  if (!match) return { view: "home" };
  return {
    view: "thread",
    topicId: decodeURIComponent(match[1]),
    postId: match[2] ? decodeURIComponent(match[2]) : null,
  };
}

export const DECISIONS_HREF = "#/decisions";

export function topicHref(topicId: string, postId?: string) {
  const base = `#/topics/${encodeURIComponent(topicId)}`;
  return postId ? `${base}/posts/${encodeURIComponent(postId)}` : base;
}

/** The current view lives in the URL hash so refresh and shared links keep it. */
export function useHashRoute(): HashRoute {
  const [route, setRoute] = useState(read);
  useEffect(() => {
    const onChange = () => setRoute(read());
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return route;
}
