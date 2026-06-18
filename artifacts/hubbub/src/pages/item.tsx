import { useState } from "react";
import { useParams, Link } from "wouter";
import {
  useGetItem, useUpdateItem, useCreateComment, useCreateTimeEntry,
  useGetProject, useUpsertPresence, useListComponents, useListMilestones,
  useAddDependency, useRemoveDependency,
} from "@workspace/api-client-react";
import type { ItemUpdateStatus, ItemUpdatePriority, ItemCategory, Commit, ProjectComponent, Milestone, Scope } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { getGetItemQueryKey } from "@workspace/api-client-react";
import { Layout } from "../components/layout";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  ArrowLeft, Clock, Bug, CheckSquare, Lightbulb, MessageSquare as ReqIcon,
  Send, GitCommit, User as UserIcon, Zap,
} from "lucide-react";
import { MarkdownRenderer } from "@/components/markdown-renderer";
import { AttachmentsPanel } from "@/components/attachments-panel";

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
const PRIORITY_OPTIONS = ["low", "medium", "high", "urgent"] as const;
const CATEGORY_LABELS: Record<string, string> = {
  infrastructure_hosting: "Infrastructure & Hosting",
  security_compliance: "Security & Compliance",
  mobile_devops: "Mobile App DevOps",
  web_devops: "Web App DevOps",
  database_schema: "Database & Schema",
  monitoring_observability: "Monitoring & Observability",
  deployment_release: "Deployment & Release",
  third_party_integration: "Third-Party Integration",
  support_operations: "Support & Operations",
};
const CATEGORY_OPTIONS = Object.keys(CATEGORY_LABELS) as ItemCategory[];

function parseTimeToMinutes(raw: string): number {
  const s = raw.trim().toLowerCase();
  if (!s) return 0;
  const hm = s.match(/^(?:(\d+(?:\.\d+)?)h)?(?:(\d+(?:\.\d+)?)m)?$/);
  if (hm && (hm[1] || hm[2])) {
    return Math.round(parseFloat(hm[1] ?? "0") * 60 + parseFloat(hm[2] ?? "0"));
  }
  const colon = s.match(/^(\d+):(\d{1,2})$/);
  if (colon) return parseInt(colon[1], 10) * 60 + parseInt(colon[2], 10);
  const n = parseFloat(s);
  if (!isNaN(n)) return Number.isInteger(n) ? n : Math.round(n * 60);
  return 0;
}

function formatMinutes(m: number) {
  return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${m % 60}m`.replace(" 0m", "");
}

export default function ItemPage() {
  const { slug, number } = useParams<{ slug: string; number: string }>();
  const { data: item, isLoading } = useGetItem(slug!, Number(number));
  const { data: project } = useGetProject(slug!);
  const { data: components = [] } = useListComponents(slug!);
  const { data: milestonesData = [] } = useListMilestones(slug!);
  const updateItem = useUpdateItem();
  const createComment = useCreateComment();
  const createTimeEntry = useCreateTimeEntry();
  const upsertPresence = useUpsertPresence();
  const addDependency = useAddDependency();
  const removeDependency = useRemoveDependency();
  const qc = useQueryClient();
  const { toast } = useToast();

  const [comment, setComment] = useState("");
  const [editDesc, setEditDesc] = useState(false);
  const [desc, setDesc] = useState("");
  const [editRationale, setEditRationale] = useState(false);
  const [rationale, setRationale] = useState("");
  const [editEstimate, setEditEstimate] = useState(false);
  const [estimateInput, setEstimateInput] = useState("");
  const [editDue, setEditDue] = useState(false);
  const [dueInput, setDueInput] = useState("");
  const [logTime, setLogTime] = useState("");
  const [logNote, setLogNote] = useState("");
  const [workingOn, setWorkingOn] = useState(false);
  const [depInput, setDepInput] = useState("");

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
    { bug: Bug, todo: CheckSquare, decision: Lightbulb, request: ReqIcon }[item.type] ?? CheckSquare;

  const members = (project as { members?: Array<{ userId: string; user?: { displayName?: string } }> })?.members ?? [];
  const commits = (item.commits ?? []) as Commit[];
  const estimateMin = item.estimateMinutes ?? null;
  const loggedMin = item.totalMinutesLogged ?? 0;

  const invalidate = () => qc.invalidateQueries({ queryKey: getGetItemQueryKey(slug!, item.number) });

  const handleField = async (patch: Parameters<typeof updateItem.mutateAsync>[0]["data"]) => {
    await updateItem.mutateAsync({ slug, itemNumber: item.number, data: patch });
    invalidate();
  };

  const handleAddDependency = async () => {
    const n = parseInt(depInput.replace(/[^0-9]/g, ""), 10);
    if (!Number.isInteger(n)) return;
    try {
      await addDependency.mutateAsync({
        slug: slug!,
        itemNumber: item.number,
        data: { dependsOnItemNumber: n },
      });
      setDepInput("");
      invalidate();
    } catch (e) {
      toast({
        title: "Couldn't add dependency",
        description: (e as Error).message,
        variant: "destructive",
      });
    }
  };

  const handleRemoveDependency = async (dependsOnItemNumber: number) => {
    await removeDependency.mutateAsync({
      slug: slug!,
      itemNumber: item.number,
      dependsOnItemNumber,
    });
    invalidate();
  };

  const handleStatusChange = (status: string) =>
    void handleField({ status: status as ItemUpdateStatus });

  const handlePriorityChange = (priority: string) =>
    void handleField({ priority: priority as ItemUpdatePriority });

  const handleCategoryChange = (value: string) =>
    void handleField({ category: value === "__none__" ? null : value as ItemCategory });

  const handleAssigneeChange = (assigneeId: string) =>
    void handleField({ assigneeId: assigneeId === "__none__" ? null : assigneeId });

  const handleComponentChange = (value: string) =>
    void handleField({ componentId: value === "__none__" ? null : Number(value) });

  const handleScopeChange = (value: string) => {
    const scopeId = value === "__none__" ? null : Number(value);
    const currentMilestoneId = (item as typeof item & { milestoneId?: number | null }).milestoneId ?? null;
    const milestoneStillValid =
      currentMilestoneId === null ||
      (scopeId !== null &&
        (milestonesData as Milestone[]).some((m) => m.id === currentMilestoneId && m.scopeId === scopeId));
    void handleField({
      scopeId,
      ...(milestoneStillValid ? {} : { milestoneId: null }),
    });
  };

  const handleMilestoneChange = (value: string) => {
    if (value === "__none__") {
      void handleField({ milestoneId: null });
      return;
    }
    const milestone = (milestonesData as Milestone[]).find((m) => m.id === Number(value));
    if (!milestone) return;
    const currentScopeId = (item as typeof item & { scopeId?: number | null }).scopeId ?? null;
    void handleField({
      milestoneId: milestone.id,
      ...(currentScopeId === milestone.scopeId ? {} : { scopeId: milestone.scopeId }),
    });
  };

  const handleSaveEstimate = async () => {
    const mins = parseTimeToMinutes(estimateInput);
    await handleField({ estimateMinutes: mins > 0 ? mins : null });
    setEditEstimate(false);
  };

  const handleSaveDue = async () => {
    await handleField({ dueDate: dueInput || null });
    setEditDue(false);
  };

  const handleSaveDesc = async () => {
    await handleField({ description: desc });
    setEditDesc(false);
  };

  const handleSaveRationale = async () => {
    await handleField({ decisionRationale: rationale });
    setEditRationale(false);
  };

  const handlePostComment = async () => {
    if (!comment.trim()) return;
    try {
      await createComment.mutateAsync({ slug, itemNumber: item.number, data: { body: comment } });
      invalidate();
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
        slug, itemNumber: item.number,
        data: { minutes, spentOn: new Date().toISOString().split("T")[0], note: logNote || null, billable: true },
      });
      invalidate();
      setLogTime(""); setLogNote("");
      toast({ title: `Logged ${formatMinutes(minutes)}` });
    } catch {
      toast({ title: "Failed to log time", variant: "destructive" });
    }
  };

  const handleWorkingOn = async () => {
    try {
      await upsertPresence.mutateAsync({ data: { itemId: workingOn ? null : item.id, note: workingOn ? null : `working on #${item.number}` } });
      setWorkingOn(!workingOn);
      toast({ title: workingOn ? "Presence cleared" : `Set working on #${item.number}` });
    } catch {
      toast({ title: "Failed to update presence", variant: "destructive" });
    }
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
        <div className="border border-border bg-card p-4 space-y-4">
          <div className="flex items-start gap-3">
            <TypeIcon className={cn("h-5 w-5 shrink-0 mt-0.5", PRIORITY_COLORS[item.priority])} />
            <div className="flex-1 min-w-0">
              <h2 className="text-lg font-['VT323'] tracking-wider text-foreground">
                #{item.number} {item.title}
              </h2>
              <div className="flex flex-wrap items-center gap-2 mt-1 text-xs font-mono text-muted-foreground">
                <span className="text-primary">{item.type}</span>
                <span>created: {new Date(item.createdAt).toLocaleDateString()}</span>
              </div>
            </div>
            <Button
              size="sm"
              variant={workingOn ? "default" : "ghost"}
              onClick={() => void handleWorkingOn()}
              disabled={upsertPresence.isPending}
              className={cn(
                "font-mono text-xs gap-1 shrink-0",
                workingOn ? "bg-accent text-accent-foreground" : "border border-border text-muted-foreground hover:text-primary hover:border-primary/50",
              )}
            >
              <Zap className="h-3 w-3" />
              {workingOn ? "WORKING ON THIS" : "WORK ON THIS"}
            </Button>
          </div>

          {/* Inline-editable fields grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs font-mono">
            {/* STATUS */}
            <div className="space-y-1">
              <span className="text-muted-foreground tracking-wider">STATUS</span>
              <Select value={item.status} onValueChange={(v) => void handleStatusChange(v)}>
                <SelectTrigger className={cn("h-7 border font-mono text-xs rounded-none w-full", STATUS_COLORS[item.status])}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-card border-border font-mono text-xs">
                  {Object.entries(STATUS_LABELS).map(([v, label]) => (
                    <SelectItem key={v} value={v} className="font-mono text-xs">{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* PRIORITY */}
            <div className="space-y-1">
              <span className="text-muted-foreground tracking-wider">PRIORITY</span>
              <Select value={item.priority} onValueChange={(v) => void handlePriorityChange(v)}>
                <SelectTrigger className={cn("h-7 border border-border font-mono text-xs rounded-none w-full", PRIORITY_COLORS[item.priority])}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-card border-border font-mono text-xs">
                  {PRIORITY_OPTIONS.map((p) => (
                    <SelectItem key={p} value={p} className={cn("font-mono text-xs", PRIORITY_COLORS[p])}>{p.toUpperCase()}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* CATEGORY */}
            <div className="space-y-1 col-span-2 md:col-span-2">
              <span className="text-muted-foreground tracking-wider">CATEGORY</span>
              <Select
                value={item.category ?? "__none__"}
                onValueChange={(v) => void handleCategoryChange(v)}
              >
                <SelectTrigger className="h-7 border border-border font-mono text-xs rounded-none w-full text-accent/80">
                  <SelectValue placeholder="uncategorized" />
                </SelectTrigger>
                <SelectContent className="bg-card border-border font-mono text-xs">
                  <SelectItem value="__none__" className="font-mono text-xs text-muted-foreground">— uncategorized —</SelectItem>
                  {CATEGORY_OPTIONS.map((c) => (
                    <SelectItem key={c} value={c} className="font-mono text-xs">{CATEGORY_LABELS[c]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* ASSIGNEE */}
            <div className="space-y-1">
              <span className="text-muted-foreground tracking-wider">ASSIGNEE</span>
              <Select
                value={(item.assignee as { clerkId?: string } | null)?.clerkId ?? "__none__"}
                onValueChange={(v) => void handleAssigneeChange(v)}
              >
                <SelectTrigger className="h-7 border border-border font-mono text-xs rounded-none w-full text-accent">
                  <SelectValue placeholder="unassigned" />
                </SelectTrigger>
                <SelectContent className="bg-card border-border font-mono text-xs">
                  <SelectItem value="__none__" className="font-mono text-xs text-muted-foreground">— unassigned</SelectItem>
                  {members.map((m) => (
                    <SelectItem key={m.userId} value={m.userId} className="font-mono text-xs">
                      <UserIcon className="h-3 w-3 inline mr-1" />
                      {m.user?.displayName ?? m.userId.slice(0, 8)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* COMPONENT */}
            {components.length > 0 && (
              <div className="space-y-1 col-span-2 md:col-span-2">
                <span className="text-muted-foreground tracking-wider">COMPONENT</span>
                <Select
                  value={(item as typeof item & { componentId?: number | null }).componentId !== null && (item as typeof item & { componentId?: number | null }).componentId !== undefined
                    ? String((item as typeof item & { componentId?: number | null }).componentId)
                    : "__none__"}
                  onValueChange={(v) => void handleComponentChange(v)}
                >
                  <SelectTrigger className="h-7 border border-border font-mono text-xs rounded-none w-full text-primary/80">
                    <SelectValue placeholder="no component" />
                  </SelectTrigger>
                  <SelectContent className="bg-card border-border font-mono text-xs">
                    <SelectItem value="__none__" className="font-mono text-xs text-muted-foreground">— no component —</SelectItem>
                    {(components as ProjectComponent[]).map((c) => (
                      <SelectItem key={c.id} value={String(c.id)} className="font-mono text-xs">{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* SCOPE + MILESTONE */}
            {(() => {
              const projectScopes = ((project as { scopes?: Scope[] } | undefined)?.scopes ?? []) as Scope[];
              if (projectScopes.length === 0) return null;
              const currentScopeId = (item as typeof item & { scopeId?: number | null }).scopeId ?? null;
              const currentMilestoneId = (item as typeof item & { milestoneId?: number | null }).milestoneId ?? null;
              const availableMilestones = (milestonesData as Milestone[]).filter(
                (m) => currentScopeId === null || m.scopeId === currentScopeId,
              );
              return (
                <>
                  <div className="space-y-1">
                    <span className="text-muted-foreground tracking-wider">SCOPE</span>
                    <Select
                      value={currentScopeId !== null ? String(currentScopeId) : "__none__"}
                      onValueChange={(v) => handleScopeChange(v)}
                    >
                      <SelectTrigger className="h-7 border border-border font-mono text-xs rounded-none w-full text-primary/80">
                        <SelectValue placeholder="no scope" />
                      </SelectTrigger>
                      <SelectContent className="bg-card border-border font-mono text-xs">
                        <SelectItem value="__none__" className="font-mono text-xs text-muted-foreground">— no scope —</SelectItem>
                        {projectScopes.map((s) => (
                          <SelectItem key={s.id} value={String(s.id)} className="font-mono text-xs">{s.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <span className="text-muted-foreground tracking-wider">MILESTONE</span>
                    <Select
                      value={currentMilestoneId !== null ? String(currentMilestoneId) : "__none__"}
                      onValueChange={(v) => handleMilestoneChange(v)}
                      disabled={availableMilestones.length === 0 && currentMilestoneId === null}
                    >
                      <SelectTrigger className="h-7 border border-border font-mono text-xs rounded-none w-full text-accent/80">
                        <SelectValue placeholder="no milestone" />
                      </SelectTrigger>
                      <SelectContent className="bg-card border-border font-mono text-xs">
                        <SelectItem value="__none__" className="font-mono text-xs text-muted-foreground">— no milestone —</SelectItem>
                        {availableMilestones.map((m) => (
                          <SelectItem key={m.id} value={String(m.id)} className="font-mono text-xs">{m.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </>
              );
            })()}

            {/* ESTIMATE vs ACTUAL */}
            <div className="space-y-1">
              <span className="text-muted-foreground tracking-wider">ESTIMATE / ACTUAL</span>
              {editEstimate ? (
                <div className="flex gap-1">
                  <Input
                    value={estimateInput}
                    onChange={(e) => setEstimateInput(e.target.value)}
                    className="h-7 bg-background border-border font-mono text-xs flex-1"
                    placeholder="2h, 30m..."
                    autoFocus
                    onKeyDown={(e) => { if (e.key === "Enter") void handleSaveEstimate(); if (e.key === "Escape") setEditEstimate(false); }}
                  />
                  <button onClick={() => void handleSaveEstimate()} className="text-primary text-xs hover:text-primary/80">[ok]</button>
                </div>
              ) : (
                <button
                  onClick={() => { setEstimateInput(estimateMin ? formatMinutes(estimateMin) : ""); setEditEstimate(true); }}
                  className="h-7 flex items-center gap-1 text-foreground hover:text-primary transition-colors"
                >
                  <Clock className="h-3 w-3 text-primary shrink-0" />
                  <span>{estimateMin ? formatMinutes(estimateMin) : "—"}</span>
                  {loggedMin > 0 && (
                    <span className="text-muted-foreground">/ {formatMinutes(loggedMin)} logged</span>
                  )}
                </button>
              )}
            </div>

            {/* DUE DATE */}
            <div className="space-y-1">
              <span className="text-muted-foreground tracking-wider">DUE DATE</span>
              {editDue ? (
                <div className="flex gap-1">
                  <Input
                    type="date"
                    value={dueInput}
                    onChange={(e) => setDueInput(e.target.value)}
                    className="h-7 bg-background border-border font-mono text-xs flex-1"
                    autoFocus
                    onKeyDown={(e) => { if (e.key === "Enter") void handleSaveDue(); if (e.key === "Escape") setEditDue(false); }}
                  />
                  <button onClick={() => void handleSaveDue()} className="text-primary text-xs hover:text-primary/80">[ok]</button>
                </div>
              ) : (
                <button
                  onClick={() => { setDueInput(item.dueDate ?? ""); setEditDue(true); }}
                  className="h-7 flex items-center text-foreground hover:text-primary transition-colors"
                >
                  {item.dueDate ?? <span className="text-muted-foreground">— click to set</span>}
                </button>
              )}
            </div>
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
                <Button size="sm" onClick={() => void handleSaveDesc()} disabled={updateItem.isPending}
                  className="bg-primary text-primary-foreground font-mono text-xs">SAVE</Button>
                <Button size="sm" variant="ghost" onClick={() => setEditDesc(false)}
                  className="border border-border font-mono text-xs">CANCEL</Button>
              </div>
            </div>
          ) : item.description ? (
            <div className="prose prose-sm prose-invert font-mono max-w-none text-foreground [&_code]:bg-muted [&_code]:px-1 [&_pre]:bg-muted [&_a]:text-primary">
              <MarkdownRenderer>{item.description}</MarkdownRenderer>
            </div>
          ) : (
            <p className="text-muted-foreground font-mono text-xs">no description — click [edit] to add</p>
          )}
        </div>

        {/* Decision Rationale (only for decision type) */}
        {item.type === "decision" && (
          <div className="border border-border bg-card p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono text-muted-foreground tracking-widest">// DECISION RATIONALE</span>
              {!editRationale && (
                <button
                  onClick={() => { setRationale(item.decisionRationale ?? ""); setEditRationale(true); }}
                  className="text-xs font-mono text-muted-foreground hover:text-primary transition-colors"
                >
                  [edit]
                </button>
              )}
            </div>
            {editRationale ? (
              <div className="space-y-2">
                <Textarea
                  value={rationale}
                  onChange={(e) => setRationale(e.target.value)}
                  className="bg-background border-border font-mono text-sm resize-none"
                  rows={4}
                  placeholder="Why was this decision made?"
                />
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => void handleSaveRationale()} disabled={updateItem.isPending}
                    className="bg-primary text-primary-foreground font-mono text-xs">SAVE</Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditRationale(false)}
                    className="border border-border font-mono text-xs">CANCEL</Button>
                </div>
              </div>
            ) : item.decisionRationale ? (
              <p className="text-sm font-mono text-foreground">{item.decisionRationale}</p>
            ) : (
              <p className="text-muted-foreground font-mono text-xs">no rationale — click [edit] to add</p>
            )}
          </div>
        )}

        {/* Linked Commits */}
        {commits.length > 0 && (
          <div className="border border-border bg-card p-4 space-y-2">
            <span className="text-xs font-mono text-muted-foreground tracking-widest">// LINKED COMMITS</span>
            <div className="divide-y divide-border">
              {commits.map((c) => (
                <div key={c.id} className="flex items-start gap-3 py-2 text-xs font-mono">
                  <GitCommit className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <code className="text-accent text-[10px]">{c.sha.slice(0, 7)}</code>
                      {c.url ? (
                        <a href={c.url} target="_blank" rel="noreferrer"
                          className="text-foreground hover:text-primary truncate transition-colors">
                          {c.message}
                        </a>
                      ) : (
                        <span className="text-foreground truncate">{c.message}</span>
                      )}
                    </div>
                    <span className="text-muted-foreground">{c.authorName ?? c.authorGithub ?? "unknown"} · {new Date(c.committedAt).toLocaleDateString()}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Log time */}
        <div className="border border-border bg-card p-4 space-y-2">
          <span className="text-xs font-mono text-muted-foreground tracking-widest">// LOG TIME</span>
          <div className="flex gap-2 flex-wrap">
            <Input value={logTime} onChange={(e) => setLogTime(e.target.value)}
              className="bg-background border-border font-mono text-sm h-8 w-28" placeholder="1h30m, 1:30..." />
            <Input value={logNote} onChange={(e) => setLogNote(e.target.value)}
              className="bg-background border-border font-mono text-sm h-8 flex-1" placeholder="optional note" />
            <Button size="sm" onClick={() => void handleLogTime()}
              disabled={!logTime.trim() || createTimeEntry.isPending}
              className="bg-primary text-primary-foreground font-mono text-xs h-8">LOG</Button>
          </div>
          <p className="text-xs text-muted-foreground font-mono">formats: 1h30m · 1:30 · 90 (min) · 1.5 (hrs)</p>
        </div>

        {/* Dependencies */}
        <div className="border border-border bg-card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono text-muted-foreground tracking-widest">// DEPENDENCIES</span>
            {item.isBlocked && (
              <span className="text-[10px] font-mono text-destructive border border-destructive/50 px-1.5 py-0.5">
                BLOCKED
              </span>
            )}
          </div>
          {(item.blockedBy ?? []).length === 0 ? (
            <p className="text-muted-foreground font-mono text-xs">not blocked by anything</p>
          ) : (
            <ul className="space-y-1">
              {(item.blockedBy ?? []).map((d) => {
                const isOpen = d.status !== "done" && d.status !== "cancelled";
                return (
                  <li key={d.id} className="flex items-center gap-2 text-xs font-mono">
                    <span className={isOpen ? "text-destructive" : "text-primary"}>blocked by</span>
                    <Link href={`/projects/${slug}/items/${d.number}`} className="text-accent hover:underline shrink-0">
                      #{d.number}
                    </Link>
                    <span className="truncate text-foreground" title={d.title}>{d.title}</span>
                    <span className="text-muted-foreground shrink-0">[{STATUS_LABELS[d.status] ?? d.status}]</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveDependency(d.number)}
                      className="ml-auto text-muted-foreground hover:text-destructive shrink-0"
                      title="Remove dependency"
                    >
                      ×
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          <div className="flex items-center gap-2">
            <Input
              value={depInput}
              onChange={(e) => setDepInput(e.target.value)}
              placeholder="#item number"
              className="h-8 font-mono text-xs"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void handleAddDependency();
                }
              }}
            />
            <Button
              type="button"
              onClick={() => void handleAddDependency()}
              disabled={!depInput.trim() || addDependency.isPending}
              className="bg-primary text-primary-foreground font-mono text-xs h-8"
            >
              ADD
            </Button>
          </div>
        </div>

        {/* Attachments */}
        <AttachmentsPanel projectSlug={slug!} entityType="item" entityId={item.id} />

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
              onKeyDown={(e) => { if (e.key === "Enter" && e.ctrlKey) void handlePostComment(); }}
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
                  <span className="text-foreground">{formatMinutes(t.minutes)}</span>
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
