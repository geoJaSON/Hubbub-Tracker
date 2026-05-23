import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import mermaid from "mermaid";

mermaid.initialize({
  startOnLoad: false,
  theme: "base",
  themeVariables: {
    background: "#0a0a0a",
    primaryColor: "#00ff41",
    primaryTextColor: "#00ff41",
    primaryBorderColor: "#00ff41",
    lineColor: "#00ff41",
    secondaryColor: "#0a1a0a",
    tertiaryColor: "#0d1a0d",
    edgeLabelBackground: "#0a0a0a",
    nodeTextColor: "#00ff41",
    clusterBkg: "#0a1a0a",
    clusterBorder: "#00ff41",
    titleColor: "#00ff41",
    attributeBackgroundColorEven: "#0a1a0a",
    attributeBackgroundColorOdd: "#0d1a0d",
    fontFamily: "'VT323', 'Courier New', monospace",
    fontSize: "16px",
  },
  flowchart: { curve: "linear", padding: 20 },
  securityLevel: "loose",
});

let mermaidCounter = 0;

function MermaidChart({ chart }: { chart: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    const id = `mermaid-${++mermaidCounter}`;
    setError(null);
    mermaid
      .render(id, chart)
      .then(({ svg }) => {
        if (ref.current) ref.current.innerHTML = svg;
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : String(err));
      });
  }, [chart]);

  if (error) {
    return (
      <div className="border border-destructive/50 bg-destructive/10 p-3 font-mono text-xs text-destructive">
        <span className="text-muted-foreground">// mermaid parse error: </span>
        {error}
      </div>
    );
  }

  return (
    <div
      ref={ref}
      className="my-4 flex justify-center overflow-x-auto [&_svg]:max-w-full [&_svg]:font-mono"
    />
  );
}

type CodeProps = {
  className?: string;
  children?: React.ReactNode;
  [key: string]: unknown;
};

function CodeBlock({ className, children, ...props }: CodeProps) {
  const lang = /language-(\w+)/.exec(className ?? "")?.[1];
  if (lang === "mermaid") {
    return <MermaidChart chart={String(children).replace(/\n$/, "")} />;
  }
  return (
    <code className={className} {...props}>
      {children}
    </code>
  );
}

interface MarkdownRendererProps {
  children: string;
  className?: string;
}

export function MarkdownRenderer({ children, className }: MarkdownRendererProps) {
  return (
    <div className={className}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ code: CodeBlock }}>
        {children}
      </ReactMarkdown>
    </div>
  );
}
