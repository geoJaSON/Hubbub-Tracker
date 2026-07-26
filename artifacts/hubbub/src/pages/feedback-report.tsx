import { useMemo, useState } from "react";
import { useParams, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  useListItems, useGetProject, getItem,
} from "@workspace/api-client-react";
import type { Item, ItemDetail, Comment } from "@workspace/api-client-react";
import { Printer, ArrowLeft, Bug, MessageSquare, Users, Inbox, CheckSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { extractFeedback, type FeedbackItem } from "@/lib/feedback";

function fmt(date: string) {
  return new Date(date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

const STATUS_LABELS: Record<string, string> = {
  open: "OPEN", in_progress: "IN PROGRESS", on_hold: "ON HOLD",
  blocked: "BLOCKED", done: "DONE", cancelled: "CANCELLED",
};
const STATUS_COLORS: Record<string, string> = {
  open: "text-foreground border-border",
  in_progress: "text-accent border-accent/50",
  on_hold: "text-yellow-500 border-yellow-500/50",
  blocked: "text-destructive border-destructive/50",
  done: "text-primary border-primary/50",
  cancelled: "text-muted-foreground border-muted",
};
const PRIORITY_COLORS: Record<string, string> = {
  low: "text-muted-foreground", medium: "text-foreground",
  high: "text-accent", urgent: "text-destructive",
};

// Per the BEACON handoff, unknown/future statuses count as still in flight.
const RESOLVED_STATUSES = new Set(["done", "cancelled"]);

type KindFilter = "all" | "bug" | "request";
type StatusFilter = "all" | "open" | "resolved";

type CommentWithAuthor = Comment & { author?: { displayName?: string } | null };

export default function FeedbackReportPage() {
  const { slug } = useParams<{ slug: string }>();
  const { data: project } = useGetProject(slug!);
  const { data: itemsData = [], isLoading } = useListItems(slug!, { includeClosed: true });

  const [kindFilter, setKindFilter] = useState<KindFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [includeResponses, setIncludeResponses] = useState(true);

  const allFeedback = useMemo(() => extractFeedback(itemsData as Item[]), [itemsData]);

  const feedback = useMemo(
    () =>
      allFeedback
        .filter((f) => kindFilter === "all" || f.kind === kindFilter)
        .filter((f) => {
          if (statusFilter === "open") return !RESOLVED_STATUSES.has(f.status);
          if (statusFilter === "resolved") return RESOLVED_STATUSES.has(f.status);
          return true;
        })
        .filter((f) => !from || f.createdAt.slice(0, 10) >= from)
        .filter((f) => !to || f.createdAt.slice(0, 10) <= to),
    [allFeedback, kindFilter, statusFilter, from, to],
  );

  // Staff responses live in item comments and need a per-item fetch.
  const feedbackNumbers = useMemo(() => feedback.map((f) => f.number), [feedback]);
  const { data: responsesByNumber = {} } = useQuery<Record<number, CommentWithAuthor[]>>({
    queryKey: ["feedback-responses", slug, feedbackNumbers],
    queryFn: async () => {
      const details = await Promise.all(
        feedbackNumbers.map((n) => getItem(slug!, n).catch(() => null)),
      );
      const map: Record<number, CommentWithAuthor[]> = {};
      for (const d of details) {
        if (d) map[(d as ItemDetail).number] = ((d as ItemDetail).comments ?? []) as CommentWithAuthor[];
      }
      return map;
    },
    enabled: includeResponses && feedbackNumbers.length > 0,
  });

  const bugs = feedback.filter((f) => f.kind === "bug");
  const requests = feedback.filter((f) => f.kind === "request");
  const reporters = useMemo(() => {
    const byId = new Map<string, { name: string; count: number }>();
    for (const f of feedback) {
      const cur = byId.get(f.authUserId);
      if (cur) cur.count += 1;
      else byId.set(f.authUserId, { name: f.reporter ?? f.authUserId, count: 1 });
    }
    return [...byId.values()].sort((a, b) => b.count - a.count);
  }, [feedback]);
  const openCount = feedback.filter((f) => !RESOLVED_STATUSES.has(f.status)).length;
  const resolvedCount = feedback.length - openCount;

  const renderEntry = (f: FeedbackItem) => {
    const responses = includeResponses ? (responsesByNumber[f.number] ?? []) : [];
    return (
      <div key={f.number} className="border border-border bg-card p-4 space-y-2 break-inside-avoid">
        <div className="flex items-start gap-2 flex-wrap">
          {f.kind === "bug"
            ? <Bug className={cn("h-3.5 w-3.5 mt-0.5 shrink-0", PRIORITY_COLORS[f.priority ?? "medium"])} />
            : <MessageSquare className={cn("h-3.5 w-3.5 mt-0.5 shrink-0", PRIORITY_COLORS[f.priority ?? "medium"])} />}
          <span className="text-xs text-muted-foreground font-mono mt-0.5">#{f.number}</span>
          <span className="flex-1 min-w-0 text-sm text-foreground font-mono">{f.title}</span>
          {f.priority && (
            <span className={cn("text-[10px] font-mono border border-border px-1.5 py-0.5 shrink-0", PRIORITY_COLORS[f.priority])}>
              {f.priority.toUpperCase()}
            </span>
          )}
          <span className={cn("text-[10px] font-mono border px-1.5 py-0.5 shrink-0", STATUS_COLORS[f.status] ?? "text-foreground border-border")}>
            {STATUS_LABELS[f.status] ?? f.status.toUpperCase()}
          </span>
        </div>
        <div className="text-[10px] text-muted-foreground font-mono flex gap-3 flex-wrap">
          <span>
            {f.reporter ?? f.authUserId}
            {f.role && ` (${f.role})`}
          </span>
          <span>{fmt(f.createdAt)}</span>
          {f.closedAt && <span>closed {fmt(f.closedAt)}</span>}
          {f.pageUrl && <span className="break-all">{f.pageUrl}</span>}
        </div>
        {f.body && (
          <p className="text-xs text-foreground font-mono whitespace-pre-wrap border-l-2 border-border pl-3">
            {f.body}
          </p>
        )}
        {responses.length > 0 && (
          <div className="space-y-1.5 pt-1">
            <div className="text-[10px] tracking-widest text-muted-foreground font-mono">// RESPONSES ({responses.length})</div>
            {responses.map((c) => (
              <div key={c.id} className="text-xs font-mono pl-3">
                <span className="text-muted-foreground">
                  {c.author?.displayName ?? c.authorId} · {fmt(c.createdAt)}:
                </span>{" "}
                <span className="text-foreground whitespace-pre-wrap">{c.body}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  const selectCls =
    "bg-background border border-border text-foreground font-mono text-xs px-2 h-7 rounded-none focus:outline-none focus:border-primary";

  return (
    <div className="min-h-screen bg-background font-mono">
      {/* Toolbar — hidden on print */}
      <div className="print:hidden border-b border-border px-6 py-3 flex items-center gap-4 bg-card sticky top-0 z-10 flex-wrap">
        <Link href={`/projects/${slug}`}>
          <Button variant="ghost" size="sm" className="font-mono text-xs text-muted-foreground gap-1 h-7 px-2">
            <ArrowLeft className="h-3 w-3" /> BACK
          </Button>
        </Link>
        <span className="text-primary font-mono text-xs tracking-widest">// USER FEEDBACK REPORT</span>
        <div className="ml-auto flex items-center gap-2 flex-wrap">
          <select value={kindFilter} onChange={(e) => setKindFilter(e.target.value as KindFilter)} className={selectCls}>
            <option value="all">BUGS + REQUESTS</option>
            <option value="bug">BUGS ONLY</option>
            <option value="request">REQUESTS ONLY</option>
          </select>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as StatusFilter)} className={selectCls}>
            <option value="all">ANY STATUS</option>
            <option value="open">OPEN ONLY</option>
            <option value="resolved">RESOLVED ONLY</option>
          </select>
          <div className="flex items-center gap-1">
            <label className="text-[10px] text-muted-foreground tracking-widest">FROM</label>
            <input type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} className={selectCls} />
          </div>
          <div className="flex items-center gap-1">
            <label className="text-[10px] text-muted-foreground tracking-widest">TO</label>
            <input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} className={selectCls} />
          </div>
          <label className="flex items-center gap-1.5 text-[10px] text-muted-foreground tracking-widest cursor-pointer select-none">
            <input
              type="checkbox"
              checked={includeResponses}
              onChange={(e) => setIncludeResponses(e.target.checked)}
              className="h-3 w-3 accent-primary"
            />
            RESPONSES
          </label>
          <Button size="sm" onClick={() => window.print()}
            className="font-mono text-xs h-7 gap-1 bg-primary text-primary-foreground hover:bg-primary/90">
            <Printer className="h-3 w-3" /> PRINT / PDF
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-64 text-muted-foreground text-sm animate-pulse">
          GENERATING REPORT...
        </div>
      ) : (
        <div className="max-w-4xl mx-auto px-8 py-10 space-y-8 print:px-6 print:py-8 print:max-w-none">
          {/* Header */}
          <div className="space-y-1 border-b border-border pb-6">
            <div className="text-xs text-muted-foreground tracking-widest">HUBBUB // USER FEEDBACK REPORT</div>
            <h1 className="text-3xl font-['VT323'] tracking-widest text-primary">
              {(project as { name?: string } | undefined)?.name ?? slug}
            </h1>
            <p className="text-sm text-muted-foreground">
              User-submitted bugs and feature requests from the BEACON web app.
            </p>
            <div className="flex gap-4 pt-2 text-xs text-muted-foreground flex-wrap">
              {(from || to) && (
                <span>PERIOD: {from ? fmt(from) : "…"} — {to ? fmt(to) : "…"}</span>
              )}
              <span>GENERATED: {fmt(new Date().toISOString())}</span>
            </div>
          </div>

          {/* Summary tiles */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {[
              { icon: Inbox, label: "TOTAL", value: String(feedback.length) },
              { icon: Bug, label: "BUGS", value: String(bugs.length) },
              { icon: MessageSquare, label: "REQUESTS", value: String(requests.length) },
              { icon: CheckSquare, label: "OPEN / RESOLVED", value: `${openCount} / ${resolvedCount}` },
              { icon: Users, label: "REPORTERS", value: String(reporters.length) },
            ].map(({ icon: Icon, label, value }) => (
              <div key={label} className="border border-border bg-card p-4 space-y-1">
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <Icon className="h-3 w-3" />
                  <span className="text-[10px] tracking-widest">{label}</span>
                </div>
                <div className="text-2xl font-['VT323'] text-foreground">{value}</div>
              </div>
            ))}
          </div>

          {feedback.length === 0 && (
            <div className="border border-border bg-card p-8 text-center text-muted-foreground text-sm">
              no user-submitted feedback matches the current filters
            </div>
          )}

          {/* Reporter breakdown */}
          {reporters.length > 0 && (
            <section className="space-y-2">
              <h2 className="text-xs tracking-widest text-muted-foreground border-b border-border pb-1">// BY REPORTER</h2>
              <div className="divide-y divide-border border border-border bg-card">
                {reporters.map((r) => (
                  <div key={r.name} className="flex items-center gap-3 px-4 py-2">
                    <Users className="h-3 w-3 text-muted-foreground shrink-0" />
                    <span className="text-xs text-foreground flex-1 truncate">{r.name}</span>
                    <span className="text-xs text-muted-foreground shrink-0">
                      {r.count} submission{r.count === 1 ? "" : "s"}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Bugs */}
          {bugs.length > 0 && (
            <section className="space-y-2">
              <h2 className="text-xs tracking-widest text-muted-foreground border-b border-border pb-1">
                // USER-REPORTED BUGS ({bugs.length})
              </h2>
              <div className="space-y-3">{bugs.map(renderEntry)}</div>
            </section>
          )}

          {/* Feature requests */}
          {requests.length > 0 && (
            <section className="space-y-2">
              <h2 className="text-xs tracking-widest text-muted-foreground border-b border-border pb-1">
                // FEATURE REQUESTS ({requests.length})
              </h2>
              <div className="space-y-3">{requests.map(renderEntry)}</div>
            </section>
          )}

          {/* Print footer */}
          <div className="hidden print:block text-[10px] text-muted-foreground pt-4 border-t border-border">
            Generated by Hubbub on {new Date().toLocaleString()} · {(project as { name?: string } | undefined)?.name ?? slug} · user feedback report
          </div>
        </div>
      )}

      {/* Print styles */}
      <style>{`
        .break-inside-avoid { break-inside: avoid; }
        @media print {
          @page { margin: 1.5cm; }
          body { background: white !important; color: black !important; }
          .border-border { border-color: #ccc !important; }
          .bg-card, .bg-background { background: white !important; }
          .text-primary { color: #1a7a2e !important; }
          .text-accent { color: #b8860b !important; }
          .text-muted-foreground { color: #666 !important; }
          .text-foreground { color: #111 !important; }
          .text-destructive { color: #c0392b !important; }
        }
      `}</style>
    </div>
  );
}
