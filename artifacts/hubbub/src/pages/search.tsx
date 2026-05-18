import { useState } from "react";
import { Link } from "wouter";
import { Layout } from "../components/layout";
import { Input } from "@/components/ui/input";
import { Search, FileText, Bug, CheckSquare, Lightbulb, MessageSquare } from "lucide-react";
import type { SearchResults, SearchResultItem } from "@workspace/api-client-react";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

const itemTypeIcon: Record<string, typeof Bug> = {
  bug: Bug,
  todo: CheckSquare,
  decision: Lightbulb,
  request: MessageSquare,
};

function useSearch(_q: string) {
  const [results, setResults] = useState<SearchResults | null>(null);
  const [loading, setLoading] = useState(false);

  const doSearch = async (query: string) => {
    if (!query.trim()) { setResults(null); return; }
    setLoading(true);
    try {
      const res = await fetch(`${basePath}/api/search?q=${encodeURIComponent(query)}`);
      const data = await res.json();
      setResults(data);
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  };

  return { results, loading, doSearch };
}

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const { results, loading, doSearch } = useSearch(query);

  return (
    <Layout title="SEARCH">
      <div className="max-w-3xl space-y-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && doSearch(query)}
            className="pl-9 bg-card border-border font-mono text-sm"
            placeholder="search items and docs... (press ENTER)"
          />
        </div>

        {loading && (
          <div className="text-muted-foreground font-mono text-sm animate-pulse">SEARCHING...</div>
        )}

        {results && (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground font-mono tracking-widest">
              {results.total} RESULT(S) FOR "{query}"
            </p>
            {results.total === 0 ? (
              <div className="border border-border bg-card p-6 text-center text-muted-foreground font-mono text-sm">
                no results found
              </div>
            ) : (
              <div className="divide-y divide-border border border-border bg-card">
                {results.results.map((r: SearchResultItem) => {
                  const Icon = r.type === "doc" ? FileText : (itemTypeIcon[r.itemType ?? ""] ?? CheckSquare);
                  const href = r.type === "doc"
                    ? `/projects/${r.projectSlug}/docs`
                    : `/projects/${r.projectSlug}/items/${r.number}`;
                  return (
                    <Link key={`${r.type}-${r.id}`} href={href}>
                      <a className="flex items-start gap-3 px-4 py-3 hover:bg-muted/30 transition-colors group">
                        <Icon className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-sm text-foreground">{r.title}</span>
                            {r.number && (
                              <span className="text-xs text-muted-foreground font-mono">#{r.number}</span>
                            )}
                          </div>
                          <div className="flex items-center gap-3 mt-0.5">
                            <span className="text-xs text-muted-foreground font-mono">{r.projectName}</span>
                            {r.status && (
                              <span className="text-xs font-mono text-accent">{r.status}</span>
                            )}
                            {r.itemType && (
                              <span className="text-xs font-mono text-muted-foreground">{r.itemType}</span>
                            )}
                          </div>
                          {r.snippet && (
                            <p className="text-xs text-muted-foreground mt-1 truncate">{r.snippet}</p>
                          )}
                        </div>
                      </a>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {!results && !loading && (
          <div className="border border-border bg-card p-8 text-center">
            <Search className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground font-mono text-sm">
              search across all items and docs
            </p>
            <p className="text-muted-foreground font-mono text-xs mt-1">
              press ENTER or type to search
            </p>
          </div>
        )}
      </div>
    </Layout>
  );
}
