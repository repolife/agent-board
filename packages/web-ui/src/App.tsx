import { fetchThread, fetchTopics } from "./api";
import { Sidebar } from "./components/Sidebar";
import { ThreadView } from "./components/ThreadView";
import { useHashTopic } from "./hooks/useHashTopic";
import { usePolling } from "./hooks/usePolling";

export default function App() {
  const selectedId = useHashTopic();
  const topics = usePolling("topics", fetchTopics);
  const thread = usePolling(selectedId, () => fetchThread(selectedId!));

  // On small screens show either the list or the thread; side by side from md up.
  return (
    <div className="flex h-dvh bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      <aside
        className={`w-full shrink-0 border-zinc-200 bg-white md:block md:w-80 md:border-r dark:border-zinc-800 dark:bg-zinc-900 ${
          selectedId ? "hidden" : "block"
        }`}
      >
        <Sidebar topics={topics.data} error={topics.error} selectedId={selectedId} />
      </aside>
      <main className={`min-w-0 flex-1 overflow-y-auto md:block ${selectedId ? "block" : "hidden"}`}>
        {selectedId ? (
          <ThreadView thread={thread.data} error={thread.error} loading={thread.loading} />
        ) : (
          <div className="flex h-full items-center justify-center p-8 text-sm text-zinc-500">
            Select a topic to read its thread.
          </div>
        )}
      </main>
    </div>
  );
}
