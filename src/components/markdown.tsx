"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { MermaidBlock } from "./mermaid-block";

/** Renders a PRD. While streaming, diagrams stay as source until the text is complete. */
export function Markdown({ text, streaming = false }: { text: string; streaming?: boolean }) {
  return (
    <div className="doc">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          code({ className, children, ...rest }) {
            const lang = /language-(\w+)/.exec(className ?? "")?.[1];
            if (lang === "mermaid" && !streaming) return <MermaidBlock code={String(children).trim()} />;
            return (
              <code className={className} {...rest}>
                {children}
              </code>
            );
          },
          // A mermaid block is rendered as a figure, so don't wrap it in <pre>.
          pre({ children }) {
            const child = Array.isArray(children) ? children[0] : children;
            const isMermaid =
              !streaming &&
              typeof child === "object" &&
              child !== null &&
              "props" in child &&
              /language-mermaid/.test(String((child.props as { className?: string }).className ?? ""));
            return isMermaid ? <>{children}</> : <pre>{children}</pre>;
          },
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}
