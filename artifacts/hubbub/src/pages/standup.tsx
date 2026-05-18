import { useGetStandup } from "@workspace/api-client-react";
import { Layout } from "../components/layout";
import ReactMarkdown from "react-markdown";

export default function StandupPage() {
  const { data: standup, isLoading } = useGetStandup();

  return (
    <Layout title="STANDUP">
      <div className="max-w-3xl space-y-4">
        <div className="text-xs text-muted-foreground font-mono tracking-widest">
          // DAILY STANDUP — {new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
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
              <ReactMarkdown>{standup.content}</ReactMarkdown>
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
