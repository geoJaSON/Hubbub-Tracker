import { useState } from "react";
import { useParams, Link } from "wouter";
import {
  useGetItem, useUpdateItem, useCreateComment, useCreateTimeEntry,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { getGetItemQueryKey } from "@workspace/api-client-react";
import { Layout } from "../components/layout";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { ArrowLeft, Clock, Bug, CheckSquare, Lightbulb, MessageSquare as ReqIcon, Send } from "lucide-react";
import ReactMarkdown from "react-markdown";

const STATUS_LABELS: Record<string, string> = {
  open: "OPEN", in_progress: "IN PROGRESS", blocked: "BLOCKED", done: "DONE", cancelled: "CANCELLED",
};
const STATUS_COLORS: Record<string, string> = {
  open: "text-foreground border-border",
  in_progress: "text-accent border-accent/50",
  blocked: "text-destructive border-destructive/50",
  done: "text-primary border-primary/50",
  cancelled: "text-muted-foreground border-muted",
};
const PRIORITY_COLORS: Record<string, string> = {
  low: "text-muted-foreground", medium: "text-foreground", high: "text-accent", urgent: "text-destructive",
};

export default function ItemPage() {
  const { slug, number } = useParams<{ slug: string; number: string }>();
  const { data: item, isLoading } = useGetItem({ slug, itemNumber: Number(number) });
  const updateItem = useUpdateItem();
  const createComment = useCreateComment();
  const createTimeEntry = useCreateTimeEntry();
  const qc = useQueryClient();
  const { toast } = useToast();

  const [comment, setComment] = useState("");
  const [editDesc, setEditDesc] = useState(false);
  const [desc, setDesc] = useState("");
  const [logMinutes, setLogMinutes] = useState("");
  const [logNote, setLogNote] = useState("");

  if (isLoading) {
    return (
      <Layout title="ITEM">
        <div className="text-muted-foreground font-mono animate-pulse">LOADING...</div>
      </Layout>
    );
  }

  if (!item) {
    return (
      <Layout title="NOT FOUND">
        <div className="text-destructive font-mono">ITEM NOT FOUND</div>
      </Layout>
    );
  }

  const TypeIcon = { bug: Bug, todo: CheckSquare, decision: Lightbulb, request: ReqIcon }[item.type] ?? CheckSquare;

  const handleStatusChange = async (status: string) => {
    await updateItem.mutateAsync({ slug, itemNumber: item.number, data: { status } as any });
    qc.invalidateQueries({ queryKey: getGetItemQueryKey({ slug, itemNumber: item.number }) });
  };

  const handlePostComment = async () => {
    if (!comment.trim()) return;
    try {
      await createComment.mutateAsync({ slug, itemNumber: item.number, data: { body: comment } });
      qc.invalidateQueries({ queryKey: getGetItemQueryKey({ slug, itemNumber: item.number }) });
      setComment("");
    } catch { toast({ title: "Failed to post comment", variant: "destructive" }); }
  };

  const handleLogTime = async () => {
    if (!logMinutes || Number(logMinutes) <= 0) return;
    try {
      await createTimeEntry.mutateAsync({
        slug,
        itemNumber: item.number,
        data: { minutes: Number(logMinutes), spentOn: new Date().toISOString().split("T")[0], note: logNote || null, billable: true },
      });
      qc.invalidateQueries({ queryKey: getGetItemQueryKey({ slug, itemNumber: item.number }) });
      setLogMinutes(""); setLogNote("");
      toast({ title: "Time logged" });
    } catch { toast({ title: "Failed to log time", variant: "destructive" }); }
  };

  const handleSaveDesc = async () => {
    await updateItem.mutateAsync({ slug, itemNumber: item.number, data: { description: desc } as any });
    qc.invalidateQueries({ queryKey: getGetItemQueryKey({ slug, itemNumber: item.number }) });
    setEditDesc(false);
  };

  return (
    <Layout title={`#${item.number}`}>
      <div className="max-w-4xl space-y-4">
        {/* Breadcrumb */}
        <Link href={`/projects/${slug}`}>
          <a className="flex items-center gap-1.5 text-xs text-muted-foreground font-mono hover:text-primary transition-colors">
            <ArrowLeft className="h-3 w-3" /> {slug}
          </a>
        </Link>

        {/* Header */}
        <div className="border border-border bg-card p-4 space-y-3">
          <div className="flex items-start gap-3">
            <TypeIcon className={cn("h-5 w-5 shrink-0 mt-0.5", PRIORITY_COLORS[item.priority])} />
            <div className="flex-1 min-w-0">
              <h2 className="text-lg font-['VT323'] tracking-wider text-foreground">
                #{item.number} {item.title}
              </h2>
              <div className="flex flex-wrap items-center gap-3 mt-1 text-xs font-mono text-muted-foreground">
                <span className="text-primary">{item.type}</span>
                <span>priority: <span className={PRIORITY_COLORS[item.priority]}>{item.priority}</span></span>
                {item.assignee && <span>assigned: <span className="text-accent">{item.assignee.displayName}</span></span>}
                {item.totalMinutesLogged != null && item.totalMinutesLogged > 0 && (
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {Math.floor(item.totalMinutesLogged / 60)}h {item.totalMinutesLogged % 60}m logged
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Status picker */}
          <div className="flex flex-wrap gap-2">
            {["open", "in_progress", "blocked", "done", "cancelled"].map((s) => (
              <button
                key={s}
                onClick={() => handleStatusChange(s)}
                className={cn(
                  "text-xs font-mono border px-2 py-0.5 transition-colors",
                  item.status === s
                    ? STATUS_COLORS[s] + " font-bold"
                    : "border-border text-muted-foreground hover:border-primary/50 hover:text-foreground",
                )}
              >
                {item.status === s ? "● " : "○ "}{STATUS_LABELS[s]}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Left: description + comments */}
          <div className="md:col-span-2 space-y-4">
            {/* Description */}
            <div className="border border-border bg-card p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono tracking-widest text-muted-foreground">// DESCRIPTION</span>
                <button
                  onClick={() => { setEditDesc(!editDesc); setDesc(item.description ?? ""); }}
                  className="text-xs font-mono text-muted-foreground hover:text-primary"
                >
                  {editDesc ? "cancel" : "edit"}
                </button>
              </div>
              {editDesc ? (
                <div className="space-y-2">
                  <Textarea
                    value={desc}
                    onChange={(e) => setDesc(e.target.value)}
                    className="bg-background border-border font-mono text-sm resize-none min-h-24"
                    placeholder="describe this item in markdown..."
                  />
                  <Button size="sm" onClick={handleSaveDesc} className="bg-primary text-primary-foreground font-mono text-xs">
                    SAVE
                  </Button>
                </div>
              ) : item.description ? (
                <div className="prose prose-sm prose-invert font-mono max-w-none text-foreground [&_code]:bg-muted [&_code]:px-1 [&_a]:text-primary">
                  <ReactMarkdown>{item.description}</ReactMarkdown>
                </div>
              ) : (
                <p className="text-muted-foreground font-mono text-sm">no description</p>
              )}
            </div>

            {/* Decision rationale */}
            {item.type === "decision" && item.decisionRationale && (
              <div className="border border-accent/50 bg-card p-4 space-y-2">
                <span className="text-xs font-mono tracking-widest text-accent">// RATIONALE</span>
                <p className="text-sm font-mono text-foreground">{item.decisionRationale}</p>
              </div>
            )}

            {/* Comments */}
            <div className="border border-border bg-card">
              <div className="border-b border-border px-4 py-2">
                <span className="text-xs font-mono tracking-widest text-muted-foreground">
                  // COMMENTS ({(item.comments ?? []).length})
                </span>
              </div>
              <div className="divide-y divide-border">
                {(item.comments ?? []).map((c: any) => (
                  <div key={c.id} className="px-4 py-3 space-y-1">
                    <div className="flex items-center gap-2 text-xs font-mono">
                      <span className="text-accent">{c.author?.displayName ?? "USER"}</span>
                      <span className="text-muted-foreground">{new Date(c.createdAt).toLocaleDateString()}</span>
                    </div>
                    <p className="text-sm font-mono text-foreground">{c.body}</p>
                  </div>
                ))}
              </div>
              <div className="border-t border-border p-3 flex gap-2">
                <span className="text-primary font-mono text-sm shrink-0">$</span>
                <input
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handlePostComment()}
                  className="flex-1 bg-transparent font-mono text-sm text-foreground outline-none placeholder:text-muted-foreground"
                  placeholder="add a comment..."
                />
                <button onClick={handlePostComment} disabled={!comment.trim()} className="text-primary hover:text-primary/80 disabled:text-muted-foreground">
                  <Send className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>

          {/* Right: meta + time */}
          <div className="space-y-4">
            {/* Meta */}
            <div className="border border-border bg-card p-4 space-y-3">
              <span className="text-xs font-mono tracking-widest text-muted-foreground">// META</span>
              {[
                { label: "Created", value: new Date(item.createdAt).toLocaleDateString() },
                { label: "Due", value: item.dueDate ?? "—" },
                { label: "Estimate", value: item.estimateMinutes ? `${Math.floor(item.estimateMinutes / 60)}h ${item.estimateMinutes % 60}m` : "—" },
              ].map((r) => (
                <div key={r.label} className="flex items-center justify-between text-xs font-mono">
                  <span className="text-muted-foreground">{r.label}</span>
                  <span className="text-foreground">{r.value}</span>
                </div>
              ))}
            </div>

            {/* Log time */}
            <div className="border border-border bg-card p-4 space-y-3">
              <span className="text-xs font-mono tracking-widest text-muted-foreground">// LOG TIME</span>
              <Input
                type="number"
                value={logMinutes}
                onChange={(e) => setLogMinutes(e.target.value)}
                className="bg-background border-border font-mono text-sm h-8"
                placeholder="minutes"
              />
              <Input
                value={logNote}
                onChange={(e) => setLogNote(e.target.value)}
                className="bg-background border-border font-mono text-sm h-8"
                placeholder="note (optional)"
              />
              <Button
                onClick={handleLogTime}
                disabled={!logMinutes}
                size="sm"
                className="w-full bg-primary text-primary-foreground font-mono text-xs tracking-wider"
              >
                LOG TIME
              </Button>
            </div>

            {/* Time entries */}
            {(item.timeEntries ?? []).length > 0 && (
              <div className="border border-border bg-card p-4 space-y-2">
                <span className="text-xs font-mono tracking-widest text-muted-foreground">// TIME LOG</span>
                {(item.timeEntries ?? []).map((t: any) => (
                  <div key={t.id} className="flex items-center gap-2 text-xs font-mono text-muted-foreground">
                    <Clock className="h-3 w-3 text-primary shrink-0" />
                    <span>{t.minutes}min</span>
                    <span>{t.spentOn}</span>
                    {t.note && <span className="text-foreground truncate">{t.note}</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
}
