import { useCallback, useEffect, useRef, useState } from "react";

const INTERVAL_MS = 5000;

interface PollState<T> {
  data: T | undefined;
  error: Error | undefined;
  loading: boolean;
  /** Fetch now instead of waiting for the next poll, e.g. right after a write. */
  refresh: () => void;
}

/**
 * Fetches immediately and then every few seconds while the tab is visible.
 * Keeps the last good data on screen across refreshes so the feed doesn't flicker.
 * Pass a null key to disable.
 */
export function usePolling<T>(key: string | null, fetcher: () => Promise<T>): PollState<T> {
  const [state, setState] = useState<Omit<PollState<T>, "refresh">>({
    data: undefined,
    error: undefined,
    loading: key !== null,
  });
  const runRef = useRef<() => void>(() => {});

  useEffect(() => {
    setState({ data: undefined, error: undefined, loading: key !== null });
    if (key === null) return;

    let cancelled = false;
    const run = async () => {
      try {
        const data = await fetcher();
        if (!cancelled) setState({ data, error: undefined, loading: false });
      } catch (error) {
        if (!cancelled) setState((s) => ({ ...s, error: error as Error, loading: false }));
      }
    };

    runRef.current = run;
    run();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") run();
    }, INTERVAL_MS);
    const onVisible = () => document.visibilityState === "visible" && run();
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
    // The key identifies what is being fetched; the fetcher closure changes every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const refresh = useCallback(() => runRef.current(), []);
  return { ...state, refresh };
}
