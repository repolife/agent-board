import { useEffect, useState } from "react";

// #/topics/<topicId> or #/topics/<topicId>/posts/<postId>
const ROUTE = /^#\/topics\/([^/]+)(?:\/posts\/([^/]+))?$/;

export interface HashRoute {
  topicId: string | null;
  postId: string | null;
}

function read(): HashRoute {
  const match = ROUTE.exec(window.location.hash);
  return match
    ? { topicId: decodeURIComponent(match[1]), postId: match[2] ? decodeURIComponent(match[2]) : null }
    : { topicId: null, postId: null };
}

export function topicHref(topicId: string, postId?: string) {
  const base = `#/topics/${encodeURIComponent(topicId)}`;
  return postId ? `${base}/posts/${encodeURIComponent(postId)}` : base;
}

/** The selected topic (and optionally a post to scroll to) lives in the URL hash so refresh and shared links keep it. */
export function useHashTopic(): HashRoute {
  const [route, setRoute] = useState(read);
  useEffect(() => {
    const onChange = () => setRoute(read());
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return route;
}
