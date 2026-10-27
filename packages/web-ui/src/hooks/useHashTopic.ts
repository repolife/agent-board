import { useEffect, useState } from "react";

const PREFIX = "#/topics/";

function read(): string | null {
  const { hash } = window.location;
  return hash.startsWith(PREFIX) ? decodeURIComponent(hash.slice(PREFIX.length)) : null;
}

export function topicHref(id: string) {
  return PREFIX + encodeURIComponent(id);
}

/** The selected topic lives in the URL hash so refresh and shared links keep it. */
export function useHashTopic(): string | null {
  const [topicId, setTopicId] = useState(read);
  useEffect(() => {
    const onChange = () => setTopicId(read());
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return topicId;
}
