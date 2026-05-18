import { useState } from "react";
import { useParams, Link } from "wouter";
import {
  useGetItem, useUpdateItem, useCreateComment, useCreateTimeEntry,
} from "@workspace/api-client-react";
import type { ItemUpdateStatus } from "@workspace/api-client-react";
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
  open: "OPEN", in_progress: "IN PROGRESS", blocked: "BLOCKED",
  done: "DONE", cancelled: "CANCELLED",
};
const STATUS_COLORS: Record<string, string> = {
  open: "text-foreground border-border",
  in_progress: "text-accent border-accent/50",
  blocked: "text-destructive border-destructive/50",
  done: "text-primary border-primary/50",
  cancelled: "text-muted-foreground border-muted",
};
const PRIORITY_COLORS: Record<string, string> = {
  low: "text-muted-foreground", medium: "text-foreground",
  high: "text-accent", urgent: "text-destructive",
};

/**
 * Parse a time string into minutes. Supports:
 *   - "90"          → 90 min
 *   - "1h30m"       → 90 min
 *   - "1h"          → 60 min
 *   - "30m"         → 30 min
 *   - "1:30"        → 90 min
 *   - "1.5"         → 90 min (treated as hours)
 * Returns 0 if the input is unparseable.
 */
function parseTimeToMinutes(raw: string): number {
  const s = raw.trim().toLowerCase();
  if (!s) return 0;

  // "1h30m" or "1h" or "30m"
  const hm = s.match(/^(?:(\d+(?:\.\d+)?)h)?(?:(\d+(?:\.\d+)?)m)?$/);
  if (hm && (hm[1] || hm[2])) {
    const h = parseFloat(hm[1] ?? "0");
    const m = parseFloat(hm[2] ?? "0");
    return Math.round(h * 60 + m);
  }

  // "1:30"
  const colon = s.match(/^(\d+):(\d{1,2})$/);
  if (colon) {
    return parseInt(colon[1], 10) * 60 + parseInt(colon[2], 10);
  }

  // plain number — treat as minutes if integer, hours if decimal
  const n = parseFloat(s);
  if (!isNaN(n)) {
    return Number.isInteger(n) ? n : Math.round(n * 60);
  }

  return 0;
}

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
  const [logTime, setLogTime] = useState("");
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

  const TypeIcon =
    { bug: Bug, todo: CheckSquare, decision: Lightbulb, request: ReqIcon }[item.type] ??
    CheckSquare;

  const handleStatusChange = async (status: string) => {
    await updateItem.mutateAsync({
      slug,
      itemNumber: item.number,
      data: { status: status as ItemUpdateStatus },
    });
    qc.invalidateQueries({ queryKey: getGetItemQueryKey({ slug, itemNumber: item.number }) });
  };

  const handlePostComment = async () => {
    if (!comment.trim()) return;
    try {
      await createComment.mutateAsync({ slug, itemNumber: item.number, data: { body: comment } });
      qc.invalidateQueries({ queryKey: getGetItemQueryKey({ slug, itemNumber: item.number }) });
      setComment("");
    } catch {
      toast({ title: "Failed to post comment", variant: "destructive" });
    }
  };

  const handleLogTime = async () => {
    const minutes = parseTimeToMinutes(logTime);
    if (!minutes || minutes <= 0) {
      toast({ title: "Enter a valid time (e.g. 1h30m, 1:30, or 90)", variant: "destructive" });
      return;
    }
    try {
      await createTimeEntry.mutateAsync({
        slug,
        itemNumber: item.number,
        data: {
          minutes,
          spentOn: new Date().toISOString().split("T")[0],
          note: logNote || null,
          billable: true,
        },
      });
      qc.invalidateQueries({ queryKey: getGetItemQueryKey({ slug, itemNumber: item.number }) });
      setLogTime("");
      setLogNote("");
      toast({ title: `Logged ${minutes}m` });
    } catch {
      toast({ title: "Failed to log time", variant: "destructive" });
    }
  };

  const handleSaveDesc = async () => {
    await updateItem.mutateAsync({
      slug,
      itemNumber: item.number,
      data: { description: desc },
    });
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
                {item.assignee && (
                  <span>assigned: <span className="text-accent">{(item.assignee as { displayName?: string }).displayName}</span></span>
                )}
                {item.dueDate && <span>due: {item.dueDate}</span>}
              </div>
            </div>
          </div>

          {/* Status picker */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono text-muted-foreground">STATUS:</span>
            <Select value={item.status} onValueChange={(v) => void handleStatusChange(v)}>
              <SelectTrigger
                className={cn("h-7 w-36 border font-mono text-xs rounded-none", STATUS_COLORS[item.status])}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-card border-border font-mono text-xs">
                {Object.entries(STATUS_LABELS).map(([v, label]) => (
                  <SelectItem key={v} value={v} className="font-mono text-xs">{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {item.totalMinutesLogged != null && item.totalMinutesLogged > 0 && (
              <span className="text-xs font-mono text-muted-foreground ml-auto">
                <Clock className="h-3 w-3 inline mr-1" />
                {Math.floor(item.totalMinutesLogged / 60)}h {item.totalMinutesLogged % 60}m logged
              </span>
            )}
          </div>
        </div>

        {/* Description */}
        <div className="border border-border bg-card p-4 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono text-muted-foreground tracking-widest">// DESCRIPTION</span>
            {!editDesc && (
              <button
                onClick={() => { setDesc(item.description ?? ""); setEditDesc(true); }}
                className="text-xs font-mono text-muted-foreground hover:text-primary transition-colors"
              >
                [edit]
              </button>
            )}
          </div>
          {editDesc ? (
            <div className="space-y-2">
              <Textarea
                value={desc}
                onChange={(e) => setDesc(e.target.value)}
                className="bg-background border-border font-mono text-sm resize-none"
                rows={5}
                placeholder="Markdown supported..."
              />
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={() => void handleSaveDesc()}
                  disabled={updateItem.isPending}
                  className="bg-primary text-primary-foreground font-mono text-xs"
                >
                  SAVE
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setEditDesc(false)}
                  className="border border-border font-mono text-xs"
                >
                  CANCEL
                </Button>
              </div>
            </div>
          ) : item.description ? (
            <div className="prose prose-sm prose-invert font-mono max-w-none text-foreground [&_code]:bg-muted [&_code]:px-1 [&_pre]:bg-muted [&_a]:text-primary">
              <ReactMarkdown>{item.description}</ReactMarkdown>
            </div>
          ) : (
            <p className="text-muted-foreground font-mono text-xs">no description</p>
          )}
        </div>

        {/* Log time */}
        <div className="border border-border bg-card p-4 space-y-2">
          <span className="text-xs font-mono text-muted-foreground tracking-widest">// LOG TIME</span>
          <div className="flex gap-2 flex-wrap">
            <Input
              value={logTime}
              onChange={(e) => setLogTime(e.target.value)}
              className="bg-background border-border font-mono text-sm h-8 w-28"
              placeholder="1h30m, 1:30..."
            />
            <Input
              value={logNote}
              onChange={(e) => setLogNote(e.target.value)}
              className="bg-background border-border font-mono text-sm h-8 flex-1"
              placeholder="optional note"
            />
            <Button
              size="sm"
              onClick={() => void handleLogTime()}
              disabled={!logTime.trim() || createTimeEntry.isPending}
              className="bg-primary text-primary-foreground font-mono text-xs h-8"
            >
              LOG
            </Button>
          </div>
          <p className="text-xs text-muted-foreground font-mono">
            formats: 1h30m · 1:30 · 90 (min) · 1.5 (hrs)
          </p>
        </div>

        {/* Comments */}
        <div className="border border-border bg-card p-4 space-y-3">
          <span className="text-xs font-mono text-muted-foreground tracking-widest">// COMMENTS</span>
          {(item.comments ?? []).length === 0 ? (
            <p className="text-muted-foreground font-mono text-xs">no comments</p>
          ) : (
            <div className="space-y-3">
              {(item.comments as Array<{ id: number; body: string; authorId: string; createdAt: string }>).map((c) => (
                <div key={c.id} className="border-l border-primary/30 pl-3 space-y-0.5">
                  <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground">
                    <span className="text-accent">{c.authorId.slice(0, 8)}</span>
                    <span>{new Date(c.createdAt).toLocaleString()}</span>
                  </div>
                  <p className="text-sm font-mono text-foreground">{c.body}</p>
                </div>
              ))}
            </div>
          )}
          <div className="flex gap-2 pt-2">
            <span className="text-primary font-mono text-sm self-center">$</span>
            <Textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              className="flex-1 bg-background border-border font-mono text-sm resize-none"
              rows={2}
              placeholder="add a comment..."
              onKeyDown={(e) => {
                if (e.key === "Enter" && e.ctrlKey) void handlePostComment();
              }}
            />
            <button
              onClick={() => void handlePostComment()}
              disabled={!comment.trim() || createComment.isPending}
              className="self-end text-primary hover:text-primary/80 disabled:text-muted-foreground"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Time entries */}
        {(item.timeEntries ?? []).length > 0 && (
          <div className="border border-border bg-card p-4 space-y-2">
            <span className="text-xs font-mono text-muted-foreground tracking-widest">// TIME ENTRIES</span>
            <div className="divide-y divide-border">
              {(item.timeEntries as Array<{ id: number; minutes: number; spentOn: string; note: string | null; userId: string }>).map((t) => (
                <div key={t.id} className="flex items-center gap-3 py-1.5 text-xs font-mono">
                  <Clock className="h-3 w-3 text-primary shrink-0" />
                  <span className="text-foreground">
                    {Math.floor(t.minutes / 60)}h {t.minutes % 60}m
                  </span>
                  <span className="text-muted-foreground">{t.spentOn}</span>
                  {t.note && <span className="text-muted-foreground truncate">{t.note}</span>}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
