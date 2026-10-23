import ReactMarkdown from "react-markdown";
import rehypeSanitize from "rehype-sanitize";
import remarkGfm from "remark-gfm";
import { MarkdownImage } from "@/components/markdown-image";
import { cn } from "@/lib/utils";

/**
 * Renders task and comment markdown. Raw HTML is never rendered, and rehype-sanitize
 * strips anything outside GitHub's safe list (scripts, event handlers, `javascript:` links).
 * Images load only from our attachment links and https.
 */
export function Markdown({ children, className }: { children: string; className?: string }) {
  return (
    <div
      className={cn(
        "prose prose-sm dark:prose-invert max-w-none break-words",
        "[&_.contains-task-list]:list-none [&_.contains-task-list]:pl-0",
        className,
      )}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeSanitize]}
        components={{
          a: ({ href, title, children }) => (
            <a href={href} title={title} target="_blank" rel="noopener noreferrer nofollow">
              {children}
            </a>
          ),
          img: ({ src, alt, title }) => (
            <MarkdownImage src={typeof src === "string" ? src : undefined} alt={alt} title={title} />
          ),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
