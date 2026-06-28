import { useState } from "react";
import { useParams, Link } from "wouter";
import { useAuth } from "@/lib/auth-context";
import { useQuery } from "@tanstack/react-query";
import { Printer, ArrowLeft, Clock, DollarSign, GitCommit, CheckSquare, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

function fmt(date: string) {
  return new Date(date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
function fmtMins(mins: number) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m > 0 ? `${m}m` : ""}`.trim() : `${m}m`;
}
function fmtCents(cents: number) {
  return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
}

type ReportData = {
  project: { id: number; name: string; slug: string; description?: string | null; githubRepo?: string | null };
  reportPeriod: { from: string; to: string };
  members: Array<{ id: number; userId: string; role: string; user: { displayName: string } | null }>;
  items: {
    total: number;
    byStatus: Record<string, Array<{ id: number; number: number; title: string; type: string; priority: string; status: string }>>;
  };
  commits: Array<{ id: number; sha: string; message: string; authorName?: string | null; authorGithub?: string | null; committedAt: string; url?: string | null }>;
  time: {
    totalMinutes: number;
    byUser: Array<{ userId: string; displayName: string; minutes: number }>;
  };
  costs: {
    totalCents: number;
    entries: Array<{ id: number; category: string; vendor?: string | null; description?: string | null; amountCents: number; incurredOn: string }>;
  };
  scopes: Array<{ id: number; name: string; status: string; budgetCents?: number | null }>;
};

const STATUS_ORDER = ["open", "in_progress", "on_hold", "blocked", "done", "cancelled"];
const STATUS_LABELS: Record<string, string> = {
  open: "OPEN", in_progress: "IN PROGRESS", on_hold: "ON HOLD", blocked: "BLOCKED", done: "DONE", cancelled: "CANCELLED",
};
const STATUS_COLORS: Record<string, string> = {
  open: "text-foreground", in_progress: "text-accent", on_hold: "text-yellow-500",
  blocked: "text-destructive", done: "text-primary", cancelled: "text-muted-foreground",
};

export default function ReportPage() {
  const { slug } = useParams<{ slug: string }>();
  const { getToken } = useAuth();

  const today = new Date().toISOString().slice(0, 10);
  const thirtyAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const [from, setFrom] = useState(thirtyAgo);
  const [to, setTo] = useState(today);
  const [fetchFrom, setFetchFrom] = useState(thirtyAgo);
  const [fetchTo, setFetchTo] = useState(today);

  const { data, isLoading, isError } = useQuery<ReportData>({
    queryKey: ["report", slug, fetchFrom, fetchTo],
    queryFn: async () => {
      const token = await getToken();
      const res = await fetch(
        `${basePath}/api/projects/${slug}/report?from=${fetchFrom}&to=${fetchTo}`,
        { headers: token ? { Authorization: `Bearer ${token}` } : {} },
      );
      if (!res.ok) throw new Error("Failed to load report");
      return res.json() as Promise<ReportData>;
    },
    enabled: !!slug,
  });

  const handleApply = () => {
    setFetchFrom(from);
    setFetchTo(to);
  };

  return (
    <div className="min-h-screen bg-background font-mono">
      {/* Toolbar — hidden on print */}
      <div className="print:hidden border-b border-border px-6 py-3 flex items-center gap-4 bg-card sticky top-0 z-10">
        <Link href={`/projects/${slug}`}>
          <Button variant="ghost" size="sm" className="font-mono text-xs text-muted-foreground gap-1 h-7 px-2">
            <ArrowLeft className="h-3 w-3" /> BACK
          </Button>
        </Link>
        <span className="text-primary font-mono text-xs tracking-widest">// PROGRESS REPORT</span>
        <div className="ml-auto flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1">
            <label className="text-[10px] text-muted-foreground tracking-widest">FROM</label>
            <input
              type="date"
              value={from}
              max={to}
              onChange={(e) => setFrom(e.target.value)}
              className="bg-background border border-border text-foreground font-mono text-xs px-2 h-7 rounded-none focus:outline-none focus:border-primary"
            />
          </div>
          <div className="flex items-center gap-1">
            <label className="text-[10px] text-muted-foreground tracking-widest">TO</label>
            <input
              type="date"
              value={to}
              min={from}
              onChange={(e) => setTo(e.target.value)}
              className="bg-background border border-border text-foreground font-mono text-xs px-2 h-7 rounded-none focus:outline-none focus:border-primary"
            />
          </div>
          <Button size="sm" variant="ghost" onClick={handleApply}
            className="font-mono text-xs h-7 border border-primary/50 text-primary hover:bg-primary/10">
            APPLY
          </Button>
          <Button size="sm" onClick={() => window.print()}
            className="font-mono text-xs h-7 gap-1 bg-primary text-primary-foreground hover:bg-primary/90">
            <Printer className="h-3 w-3" /> PRINT
          </Button>
        </div>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center h-64 text-muted-foreground text-sm animate-pulse">
          GENERATING REPORT...
        </div>
      )}
      {isError && (
        <div className="flex items-center justify-center h-64 text-destructive text-sm">
          FAILED TO LOAD REPORT
        </div>
      )}

      {data && (
        <div className="max-w-4xl mx-auto px-8 py-10 space-y-8 print:px-6 print:py-8 print:max-w-none">
          {/* Header */}
          <div className="space-y-1 border-b border-border pb-6">
            <div className="text-xs text-muted-foreground tracking-widest">HUBBUB // PROGRESS REPORT</div>
            <h1 className="text-3xl font-['VT323'] tracking-widest text-primary">{data.project.name}</h1>
            {data.project.description && (
              <p className="text-sm text-muted-foreground">{data.project.description}</p>
            )}
            <div className="flex gap-4 pt-2 text-xs text-muted-foreground">
              <span>PERIOD: {fmt(data.reportPeriod.from)} — {fmt(data.reportPeriod.to)}</span>
              <span>GENERATED: {fmt(new Date().toISOString())}</span>
            </div>
          </div>

          {/* Summary row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { icon: CheckSquare, label: "TOTAL ITEMS", value: String(data.items.total) },
              { icon: GitCommit, label: "COMMITS", value: String(data.commits.length) },
              { icon: Clock, label: "TIME LOGGED", value: data.time.totalMinutes > 0 ? fmtMins(data.time.totalMinutes) : "—" },
              { icon: DollarSign, label: "TOTAL COST", value: data.costs.totalCents > 0 ? fmtCents(data.costs.totalCents) : "—" },
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

          {/* Scopes */}
          {data.scopes.length > 0 && (
            <section className="space-y-2">
              <h2 className="text-xs tracking-widest text-muted-foreground border-b border-border pb-1">// SCOPES</h2>
              <div className="divide-y divide-border border border-border bg-card">
                {data.scopes.map((s) => (
                  <div key={s.id} className="flex items-center gap-3 px-4 py-2.5">
                    <span className="font-mono text-sm text-foreground flex-1">{s.name}</span>
                    <span className={cn("text-xs border px-1.5 py-0.5",
                      s.status === "complete" ? "border-primary/50 text-primary" :
                      s.status === "active" ? "border-accent/50 text-accent" :
                      "border-border text-muted-foreground"
                    )}>{s.status.toUpperCase()}</span>
                    {s.budgetCents != null && (
                      <span className="text-xs text-muted-foreground">{fmtCents(s.budgetCents)}</span>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Items by status */}
          <section className="space-y-2">
            <h2 className="text-xs tracking-widest text-muted-foreground border-b border-border pb-1">// ITEMS BY STATUS</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-center">
              {STATUS_ORDER.map((s) => {
                const count = (data.items.byStatus[s] ?? []).length;
                if (count === 0) return null;
                return (
                  <div key={s} className="border border-border bg-card p-3">
                    <div className={cn("text-2xl font-['VT323']", STATUS_COLORS[s])}>{count}</div>
                    <div className="text-[10px] text-muted-foreground tracking-widest">{STATUS_LABELS[s]}</div>
                  </div>
                );
              })}
            </div>
            {STATUS_ORDER.map((s) => {
              const list = data.items.byStatus[s] ?? [];
              if (list.length === 0) return null;
              return (
                <div key={s} className="space-y-1">
                  <div className={cn("text-[10px] tracking-widest pt-2", STATUS_COLORS[s])}>{STATUS_LABELS[s]} ({list.length})</div>
                  <div className="divide-y divide-border border border-border bg-card">
                    {list.map((item) => (
                      <div key={item.id} className="flex items-center gap-2 px-3 py-2">
                        <span className="text-xs text-muted-foreground w-6 shrink-0">#{item.number}</span>
                        <span className="text-xs text-foreground flex-1 min-w-0 truncate">{item.title}</span>
                        <span className="text-[10px] text-muted-foreground shrink-0">{item.type.toUpperCase()}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </section>

          {/* Commits */}
          {data.commits.length > 0 && (
            <section className="space-y-2">
              <h2 className="text-xs tracking-widest text-muted-foreground border-b border-border pb-1">
                // COMMITS IN PERIOD ({data.commits.length})
              </h2>
              <div className="divide-y divide-border border border-border bg-card">
                {data.commits.map((c) => (
                  <div key={c.id} className="flex items-start gap-3 px-3 py-2.5">
                    <GitCommit className="h-3 w-3 text-muted-foreground mt-0.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-foreground truncate">{c.message.split("\n")[0]}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {c.authorGithub ? `@${c.authorGithub}` : (c.authorName ?? "unknown")} · {fmt(c.committedAt)} · {c.sha.slice(0, 7)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Time */}
          {data.time.totalMinutes > 0 && (
            <section className="space-y-2">
              <h2 className="text-xs tracking-widest text-muted-foreground border-b border-border pb-1">
                // TIME LOGGED — {fmtMins(data.time.totalMinutes)} TOTAL
              </h2>
              <div className="divide-y divide-border border border-border bg-card">
                {data.time.byUser.map((u) => (
                  <div key={u.userId} className="flex items-center gap-3 px-4 py-2.5">
                    <span className="font-mono text-sm text-foreground flex-1">{u.displayName}</span>
                    <span className="text-xs text-muted-foreground font-mono">{fmtMins(u.minutes)}</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Costs */}
          {data.costs.entries.length > 0 && (
            <section className="space-y-2">
              <h2 className="text-xs tracking-widest text-muted-foreground border-b border-border pb-1">
                // COSTS — {fmtCents(data.costs.totalCents)} TOTAL
              </h2>
              <div className="divide-y divide-border border border-border bg-card">
                {data.costs.entries.map((e) => (
                  <div key={e.id} className="flex items-center gap-3 px-4 py-2.5">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-foreground">{e.description ?? e.vendor ?? e.category}</p>
                      <p className="text-[10px] text-muted-foreground">{e.category.toUpperCase()} · {fmt(e.incurredOn)}</p>
                    </div>
                    <span className="text-xs font-mono text-foreground shrink-0">{fmtCents(e.amountCents)}</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Members */}
          <section className="space-y-2">
            <h2 className="text-xs tracking-widest text-muted-foreground border-b border-border pb-1">// TEAM</h2>
            <div className="divide-y divide-border border border-border bg-card">
              {data.members.map((m) => (
                <div key={m.id} className="flex items-center gap-3 px-4 py-2.5">
                  <Users className="h-3 w-3 text-muted-foreground shrink-0" />
                  <span className="font-mono text-sm text-foreground flex-1">
                    {m.user?.displayName ?? m.userId}
                  </span>
                  <span className={cn("text-xs border px-1.5 py-0.5",
                    m.role === "owner" ? "border-accent/50 text-accent" : "border-border text-muted-foreground"
                  )}>{m.role.toUpperCase()}</span>
                </div>
              ))}
            </div>
          </section>

          {/* Print footer */}
          <div className="hidden print:block text-[10px] text-muted-foreground pt-4 border-t border-border">
            Generated by Hubbub on {new Date().toLocaleString()} · {data.project.name} · {fmt(data.reportPeriod.from)} – {fmt(data.reportPeriod.to)}
          </div>
        </div>
      )}

      {/* Print styles */}
      <style>{`
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
