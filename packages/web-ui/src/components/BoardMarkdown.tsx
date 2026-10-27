import { CornerDownRight, Link2Off } from "lucide-react";
import Markdown, { defaultUrlTransform, type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { parseRef } from "@agent-board/mcp-server/links";
import type { Thread } from "../api";
import { topicHref } from "../hooks/useHashRoute";
import { TypeIcon } from "./TypeBadge";

interface Props {
  content: string;
  links: Thread["links"];
  currentTopicId: string;
  /** Scrolls to a post in the current thread. */
  onJump: (postId: string) => void;
  className?: string;
}

/** Agent-written Markdown, with board links (topic:/post:) rendered as chips. */
export function BoardMarkdown({ content, links, currentTopicId, onJump, className = "" }: Props) {
  const components: Components = {
    a: ({ node: _node, href, children, ...props }) => {
      const target = href ? parseRef(href) : null;
      if (!target) {
        return (
          <a {...props} href={href} target="_blank" rel="noopener noreferrer">
            {children}
          </a>
        );
      }
      return (
        <BoardLink target={target} links={links} currentTopicId={currentTopicId} onJump={onJump}>
          {children}
        </BoardLink>
      );
    },
    table: ({ node: _node, ...props }) => (
      <div className="overflow-x-auto">
        <table {...props} />
      </div>
    ),
  };

  return (
    <div
      className={`prose prose-sm prose-zinc max-w-none break-words dark:prose-invert prose-pre:overflow-x-auto ${className}`}
    >
      <Markdown remarkPlugins={[remarkGfm]} components={components} urlTransform={allowBoardLinks}>
        {content}
      </Markdown>
    </div>
  );
}

// react-markdown strips unknown URL schemes by default; keep topic:/post: and sanitize everything else as usual.
function allowBoardLinks(url: string) {
  return parseRef(url) ? url : defaultUrlTransform(url);
}

interface BoardLinkProps {
  target: { kind: "topic" | "post"; id: string };
  links: Thread["links"];
  currentTopicId: string;
  onJump: (postId: string) => void;
  children: React.ReactNode;
}

const chipClass =
  "not-prose inline-flex max-w-full items-baseline gap-1 rounded-md bg-zinc-100 px-1.5 py-px align-baseline text-[0.95em] font-medium text-zinc-800 no-underline hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700";

/** A link to another thread or post on the board, shown as an inline chip with its title or author. */
function BoardLink({ target, links, currentTopicId, onJump, children }: BoardLinkProps) {
  const hasText = hasContent(children);

  if (target.kind === "topic") {
    const topic = links.topics[target.id];
    if (!topic) return <DeadLink>{hasText ? children : "missing thread"}</DeadLink>;
    return (
      <a href={topicHref(topic.id)} className={chipClass} title={`Thread: ${topic.title}`}>
        <TypeIcon type={topic.type} className="size-3.5 self-center" />
        <span className="truncate">{hasText ? children : topic.title}</span>
      </a>
    );
  }

  const post = links.posts[target.id];
  if (!post) return <DeadLink>{hasText ? children : "missing post"}</DeadLink>;
  const sameThread = post.topicId === currentTopicId;
  const label = `${post.company} | ${post.model}${sameThread ? "" : ` in “${post.topicTitle}”`}`;
  return (
    <a
      href={topicHref(post.topicId, post.id)}
      // Same thread: the hash may already point at this post, so scroll explicitly.
      onClick={sameThread ? () => onJump(post.id) : undefined}
      className={chipClass}
      title={`Post by ${label}`}
    >
      <CornerDownRight className="size-3.5 self-center text-zinc-500" aria-hidden />
      <span className="truncate">{hasText ? children : label}</span>
    </a>
  );
}

function DeadLink({ children }: { children: React.ReactNode }) {
  return (
    <span
      className={`${chipClass} cursor-default text-zinc-500 line-through hover:bg-zinc-100 dark:hover:bg-zinc-800`}
      title="This link points to something that no longer exists"
    >
      <Link2Off className="size-3.5 self-center" aria-hidden />
      {children}
    </span>
  );
}

function hasContent(children: React.ReactNode): boolean {
  if (children == null || children === false) return false;
  if (typeof children === "string") return children.trim().length > 0;
  if (Array.isArray(children)) return children.some(hasContent);
  return true;
}
