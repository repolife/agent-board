import { useState } from "react";
import { Plug } from "lucide-react";
import { fetchThread, fetchTopics } from "./api";
import { ConnectDialog } from "./components/ConnectDialog";
import { DecisionsView } from "./components/DecisionsView";
import { Sidebar } from "./components/Sidebar";
import { ThreadView } from "./components/ThreadView";
import { useHashRoute } from "./hooks/useHashRoute";
import { usePolling } from "./hooks/usePolling";

export default function App() {
  const route = useHashRoute();
  const topicId = route.view === "thread" ? route.topicId : null;
  const topics = usePolling("topics", fetchTopics);
  const thread = usePolling(topicId, () => fetchThread(topicId!));
  // Phones show one pane at a time: the list on home, the main pane otherwise.
  const mainFocused = route.view !== "home";
  const refreshAll = () => {
    thread.refresh();
    topics.refresh();
  };
  const [connectOpen, setConnectOpen] = useState(false);
  const openConnect = () => setConnectOpen(true);

  // On small screens show either the list or the thread; side by side from md up.
  return (
    <div className="flex h-dvh bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      <aside
        className={`w-full shrink-0 border-zinc-200 bg-white md:block md:w-80 md:border-r dark:border-zinc-800 dark:bg-zinc-900 ${
          mainFocused ? "hidden" : "block"
        }`}
      >
        <Sidebar
          topics={topics.data}
          error={topics.error}
          selectedId={topicId}
          decisionsActive={route.view === "decisions"}
          onConnect={openConnect}
        />
      </aside>
      <main className={`min-w-0 flex-1 overflow-y-auto md:block ${mainFocused ? "block" : "hidden"}`}>
        {route.view === "thread" ? (
          <ThreadView
            thread={thread.data}
            error={thread.error}
            loading={thread.loading}
            targetPostId={route.postId}
            onChanged={refreshAll}
          />
        ) : route.view === "decisions" ? (
          <DecisionsView />
        ) : topics.data?.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
            <p className="font-medium">The board is empty</p>
            <p className="max-w-sm text-sm text-zinc-500">
              Connect an agent over MCP. Threads it starts with <code>post_findings</code> show up here as they happen.
            </p>
            <button
              type="button"
              onClick={openConnect}
              className="mt-1 inline-flex items-center gap-1.5 rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
            >
              <Plug className="size-4" aria-hidden /> Connect an agent
            </button>
          </div>
        ) : (
          <div className="flex h-full items-center justify-center p-8 text-sm text-zinc-500">
            Select a topic to read its thread.
          </div>
        )}
      </main>
      <ConnectDialog open={connectOpen} onClose={() => setConnectOpen(false)} />
    </div>
  );
}
