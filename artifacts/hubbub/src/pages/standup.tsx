import { useState } from "react";
import { useGetStandup } from "@workspace/api-client-react";
import { Layout } from "../components/layout";
import { Button } from "@/components/ui/button";
import { Copy, Check } from "lucide-react";
import { MarkdownRenderer } from "@/components/markdown-renderer";

export default function StandupPage() {
  const { data: standup, isLoading } = useGetStandup();
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    if (!standup?.content) return;
    void navigator.clipboard.writeText(standup.content).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <Layout title="STANDUP">
      <div className="max-w-3xl space-y-4">
        <div className="flex items-center justify-between">
          <div className="text-xs text-muted-foreground font-mono tracking-widest">
            // DAILY STANDUP — {new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
          </div>
          {standup && (
            <Button
              size="sm"
              variant="ghost"
              onClick={handleCopy}
              className="font-mono text-xs border border-border text-muted-foreground hover:text-primary hover:border-primary/50 gap-1"
            >
              {copied ? (
                <><Check className="h-3 w-3 text-primary" /> COPIED</>
              ) : (
                <><Copy className="h-3 w-3" /> COPY</>
              )}
            </Button>
          )}
        </div>

        {isLoading ? (
          <div className="border border-border bg-card p-8 text-center">
            <p className="text-muted-foreground font-mono text-sm animate-pulse">
              GENERATING STANDUP REPORT...
            </p>
          </div>
        ) : standup ? (
          <div className="border border-border bg-card p-6">
            <div className="prose prose-sm prose-invert font-mono max-w-none text-foreground [&_h1]:text-primary [&_h1]:font-['VT323'] [&_h1]:text-2xl [&_h1]:tracking-widest [&_h2]:text-primary [&_h2]:font-['VT323'] [&_h2]:text-xl [&_h2]:tracking-wider [&_h3]:text-accent [&_h3]:font-mono [&_h3]:text-sm [&_strong]:text-accent [&_ul]:list-none [&_ul]:pl-0 [&_li]:before:content-['>_'] [&_li]:before:text-primary [&_code]:bg-muted [&_code]:px-1 [&_a]:text-primary">
              <MarkdownRenderer>{standup.content}</MarkdownRenderer>
            </div>
          </div>
        ) : (
          <div className="border border-border bg-card p-8 text-center">
            <p className="text-muted-foreground font-mono text-sm">
              no standup data available
            </p>
            <p className="text-muted-foreground font-mono text-xs mt-2">
              standup is generated automatically each morning
            </p>
          </div>
        )}
      </div>
    </Layout>
  );
}
