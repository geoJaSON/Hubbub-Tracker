import { useGetDashboard } from "@workspace/api-client-react";
import { Layout } from "../components/layout";
import { Link } from "wouter";
import { Activity, Clock, AlertTriangle, FolderKanban, ChevronRight } from "lucide-react";

export default function Dashboard() {
  const { data, isLoading } = useGetDashboard();

  return (
    <Layout title="DASHBOARD">
      {isLoading ? (
        <div className="flex items-center gap-2 text-muted-foreground font-mono text-sm">
          <span className="text-primary animate-pulse">█</span>
          <span>LOADING...</span>
        </div>
      ) : (
        <div className="space-y-6 max-w-5xl">
          {/* Stats row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              {
                label: "PROJECTS",
                value: data?.projects?.length ?? 0,
                icon: FolderKanban,
                color: "text-primary",
              },
              {
                label: "OPEN ITEMS",
                value: data?.openItems ?? 0,
                icon: Activity,
                color: "text-primary",
              },
              {
                label: "OVERDUE",
                value: data?.overdueItems ?? 0,
                icon: AlertTriangle,
                color: "text-destructive",
              },
              {
                label: "ONLINE",
                value: data?.teamPresence?.length ?? 0,
                icon: Clock,
                color: "text-accent",
              },
            ].map((stat) => (
              <div
                key={stat.label}
                className="border border-border bg-card p-4 space-y-2 hover:border-primary/50 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <stat.icon className={`h-3.5 w-3.5 ${stat.color}`} />
                  <span className="text-xs text-muted-foreground font-mono tracking-widest">{stat.label}</span>
                </div>
                <p className={`text-3xl font-['VT323'] ${stat.color} terminal-glow`}>
                  {stat.value}
                </p>
              </div>
            ))}
          </div>

          {/* Projects + Activity */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Projects */}
            <div className="border border-border bg-card">
              <div className="flex items-center gap-2 border-b border-border px-4 py-2">
                <span className="text-primary text-xs font-mono tracking-widest">//</span>
                <span className="text-xs font-mono tracking-widest text-foreground">MY PROJECTS</span>
              </div>
              <div className="divide-y divide-border">
                {(data?.projects ?? []).length === 0 ? (
                  <p className="px-4 py-4 text-sm text-muted-foreground font-mono">
                    no projects yet —{" "}
                    <Link href="/projects" className="text-primary hover:underline">create one</Link>
                  </p>
                ) : (
                  (data?.projects ?? []).slice(0, 6).map((p) => (
                    <Link
                      key={p.id}
                      href={`/projects/${p.slug}`}
                      className="flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors group"
                    >
                      <span className="text-primary font-mono text-xs">&gt;</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-mono text-foreground truncate">{p.name}</p>
                        <p className="text-xs text-muted-foreground">{p.slug}</p>
                      </div>
                      <ChevronRight className="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary transition-colors" />
                    </Link>
                  ))
                )}
              </div>
            </div>

            {/* Recent Activity */}
            <div className="border border-border bg-card">
              <div className="flex items-center gap-2 border-b border-border px-4 py-2">
                <span className="text-primary text-xs font-mono tracking-widest">//</span>
                <span className="text-xs font-mono tracking-widest text-foreground">RECENT ACTIVITY</span>
              </div>
              <div className="divide-y divide-border max-h-80 overflow-auto">
                {(data?.recentActivity ?? []).length === 0 ? (
                  <p className="px-4 py-4 text-sm text-muted-foreground font-mono">
                    no activity yet
                  </p>
                ) : (
                  (data?.recentActivity ?? []).map((e) => {
                    const num = (e.payload as { number?: number } | undefined)?.number;
                    const who = e.actor?.displayName ?? "someone";
                    return (
                      <div key={e.id} className="px-4 py-2 text-xs font-mono">
                        <span className="text-primary">[{e.type.replace(/_/g, " ")}]</span>{" "}
                        {num != null && <span className="text-accent">#{num} </span>}
                        <span className="text-foreground">{who}</span>{" "}
                        <span className="text-muted-foreground">
                          {new Date(e.createdAt).toLocaleString()}
                        </span>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          {/* Presence */}
          {(data?.teamPresence ?? []).length > 0 && (
            <div className="border border-border bg-card">
              <div className="flex items-center gap-2 border-b border-border px-4 py-2">
                <span className="text-primary text-xs font-mono tracking-widest">//</span>
                <span className="text-xs font-mono tracking-widest text-foreground">TEAM ONLINE</span>
              </div>
              <div className="flex flex-wrap gap-3 p-4">
                {(data?.teamPresence ?? []).map((p) => (
                  <div key={p.userId} className="flex items-center gap-2 border border-border px-2 py-1 text-xs font-mono">
                    <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
                    <span className="text-foreground">{p.user?.displayName ?? p.userId.slice(0, 8)}</span>
                    {p.item && <span className="text-muted-foreground">· #{p.item.number}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </Layout>
  );
}
