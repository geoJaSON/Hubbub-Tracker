import { useState, useMemo, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { Plus, Pencil, Trash2, ChevronLeft, ChevronRight, Flag, CheckSquare } from "lucide-react";
import type { Milestone, MilestoneInput, MilestoneUpdate, Scope, Item } from "@workspace/api-client-react";

// ── Helpers ──────────────────────────────────────────────────────────────────

function parseDate(s: string | null | undefined): Date | null {
  if (!s) return null;
  const d = new Date(s + "T00:00:00");
  return isNaN(d.getTime()) ? null : d;
}

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

function monthLabel(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
}

// ── Gantt grid constants ──────────────────────────────────────────────────────

const DAY_PX = 18;          // px per day cell
const ROW_H = 36;           // px per milestone row
const SCOPE_ROW_H = 30;      // px per scope summary row
const LABEL_W = 240;        // px for left label column
const ITEM_ROW_H = 28;      // px per item-due row

// ── Types ────────────────────────────────────────────────────────────────────

interface GanttSchedulerProps {
  scopes: Scope[];
  milestones: Milestone[];
  items: Item[];
  onCreateMilestone: (data: MilestoneInput) => Promise<void>;
  onUpdateMilestone: (id: number, data: MilestoneUpdate) => Promise<void>;
  onDeleteMilestone: (id: number) => Promise<void>;
}

type TimelineRow =
  | { kind: "scope"; scope: Scope }
  | { kind: "milestone"; milestone: Milestone; scope: Scope | null };

// ── Main component ────────────────────────────────────────────────────────────

export function GanttScheduler({
  scopes,
  milestones,
  items,
  onCreateMilestone,
  onUpdateMilestone,
  onDeleteMilestone,
}: GanttSchedulerProps) {
  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  // Viewport: how many days to show
  const [viewDays, setViewDays] = useState(90);
  const [viewStart, setViewStart] = useState<Date>(() => addDays(today, -14));

  const viewEnd = useMemo(() => addDays(viewStart, viewDays), [viewStart, viewDays]);

  // Dialogs
  const [createOpen, setCreateOpen] = useState(false);
  const [editMilestone, setEditMilestone] = useState<Milestone | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Milestone | null>(null);

  const emptyForm = { name: "", description: "", startDate: "", targetDate: "", scopeId: "" };
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  // Items with due dates
  const datedItems = useMemo(
    () => items.filter((i) => i.dueDate && i.status !== "cancelled"),
    [items],
  );

  const scopeById = useMemo(
    () => new Map(scopes.map((scope) => [scope.id, scope])),
    [scopes],
  );

  const milestoneById = useMemo(
    () => new Map(milestones.map((milestone) => [milestone.id, milestone])),
    [milestones],
  );

  const timelineRows = useMemo<TimelineRow[]>(() => {
    const milestonesByScope = new Map<number, Milestone[]>();
    milestones.forEach((milestone) => {
      const list = milestonesByScope.get(milestone.scopeId) ?? [];
      list.push(milestone);
      milestonesByScope.set(milestone.scopeId, list);
    });

    const rows: TimelineRow[] = [];
    [...scopes]
      .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name))
      .forEach((scope) => {
        rows.push({ kind: "scope", scope });
        (milestonesByScope.get(scope.id) ?? [])
          .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name))
          .forEach((milestone) => rows.push({ kind: "milestone", milestone, scope }));
      });

    milestones
      .filter((milestone) => !scopeById.has(milestone.scopeId))
      .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name))
      .forEach((milestone) => rows.push({ kind: "milestone", milestone, scope: null }));

    return rows;
  }, [milestones, scopeById, scopes]);

  // Month headers
  const monthHeaders = useMemo(() => {
    const months: { label: string; startDay: number; spanDays: number }[] = [];
    let cur = new Date(viewStart);
    cur.setDate(1);
    while (cur < viewEnd) {
      const monthStart = cur < viewStart ? viewStart : cur;
      const nextMonth = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
      const monthEnd = nextMonth > viewEnd ? viewEnd : nextMonth;
      months.push({
        label: monthLabel(cur),
        startDay: daysBetween(viewStart, monthStart),
        spanDays: daysBetween(monthStart, monthEnd),
      });
      cur = nextMonth;
    }
    return months;
  }, [viewStart, viewEnd]);

  // Day columns for tick marks (every 7 days)
  const weekTicks = useMemo(() => {
    const ticks: number[] = [];
    for (let d = 0; d < viewDays; d += 7) ticks.push(d);
    return ticks;
  }, [viewDays]);

  const todayOffset = useMemo(() => daysBetween(viewStart, today), [viewStart, today]);

  // Clamp a date to the viewport
  function clampToView(d: Date): number {
    const off = daysBetween(viewStart, d);
    return Math.max(0, Math.min(off, viewDays));
  }

  // Scroll
  function pan(days: number) {
    setViewStart((s) => addDays(s, days));
  }

  // ── Create / Edit helpers ────────────────────────────────────────────────

  function openCreate() {
    setForm({ ...emptyForm, startDate: formatDate(today), scopeId: scopes[0]?.id?.toString() ?? "" });
    setCreateOpen(true);
  }

  function openEdit(m: Milestone) {
    setForm({
      name: m.name,
      description: m.description ?? "",
      startDate: m.startDate ?? "",
      targetDate: m.targetDate ?? "",
      scopeId: String(m.scopeId),
    });
    setEditMilestone(m);
  }

  async function submitCreate() {
    if (!form.name.trim() || !form.scopeId) return;
    setSaving(true);
    try {
      await onCreateMilestone({
        scopeId: Number(form.scopeId),
        name: form.name.trim(),
        description: form.description || null,
        startDate: form.startDate || null,
        targetDate: form.targetDate || null,
      });
      setCreateOpen(false);
      setForm(emptyForm);
    } finally {
      setSaving(false);
    }
  }

  async function submitEdit() {
    if (!editMilestone || !form.name.trim()) return;
    setSaving(true);
    try {
      await onUpdateMilestone(editMilestone.id, {
        name: form.name.trim(),
        description: form.description || null,
        startDate: form.startDate || null,
        targetDate: form.targetDate || null,
      });
      setEditMilestone(null);
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setSaving(true);
    try {
      await onDeleteMilestone(deleteTarget.id);
      setDeleteTarget(null);
    } finally {
      setSaving(false);
    }
  }

  // ── Drag-to-resize bar ───────────────────────────────────────────────────

  const dragRef = useRef<{
    milestoneId: number;
    edge: "start" | "end";
    originX: number;
    originDay: number;
  } | null>(null);

  function onBarMouseDown(
    e: React.MouseEvent,
    milestoneId: number,
    edge: "start" | "end",
    currentDay: number,
  ) {
    e.preventDefault();
    dragRef.current = { milestoneId, edge, originX: e.clientX, originDay: currentDay };
    const onMove = (ev: MouseEvent) => {
      if (!dragRef.current) return;
      const delta = Math.round((ev.clientX - dragRef.current.originX) / DAY_PX);
      const newDay = dragRef.current.originDay + delta;
      const newDate = addDays(viewStart, newDay);
      const m = milestones.find((x) => x.id === dragRef.current!.milestoneId);
      if (!m) return;
      if (dragRef.current.edge === "start") {
        void onUpdateMilestone(m.id, { startDate: formatDate(newDate) });
      } else {
        void onUpdateMilestone(m.id, { targetDate: formatDate(newDate) });
      }
    };
    const onUp = () => {
      dragRef.current = null;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  const gridW = viewDays * DAY_PX;

  return (
    <div className="flex flex-col h-full min-h-0 font-mono select-none">
      {/* Toolbar */}
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <Button
          size="sm"
          onClick={openCreate}
          disabled={scopes.length === 0}
          className="h-7 font-mono text-xs rounded-none bg-primary/10 border border-primary/40 text-primary hover:bg-primary/20 gap-1"
        >
          <Plus className="h-3 w-3" /> NEW MILESTONE
        </Button>
        {scopes.length === 0 && (
          <span className="text-xs text-muted-foreground font-mono">
            (create a scope first in SETTINGS to add milestones)
          </span>
        )}
        <div className="ml-auto flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-7 w-7 rounded-none border border-border hover:border-primary/40" onClick={() => pan(-30)}>
            <ChevronLeft className="h-3 w-3" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7 rounded-none border border-border hover:border-primary/40" onClick={() => pan(-7)}>
            <span className="text-[10px]">-7d</span>
          </Button>
          <Button variant="ghost" size="sm" className="h-7 font-mono text-[10px] rounded-none border border-border hover:border-primary/40 px-2" onClick={() => setViewStart(addDays(today, -14))}>
            TODAY
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7 rounded-none border border-border hover:border-primary/40" onClick={() => pan(7)}>
            <span className="text-[10px]">+7d</span>
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7 rounded-none border border-border hover:border-primary/40" onClick={() => pan(30)}>
            <ChevronRight className="h-3 w-3" />
          </Button>
          <div className="w-px h-5 bg-border mx-1" />
          {[30, 60, 90, 180].map((d) => (
            <Button
              key={d}
              variant="ghost"
              size="sm"
              className={cn(
                "h-7 font-mono text-[10px] rounded-none border px-2",
                viewDays === d ? "border-primary/50 text-primary bg-primary/10" : "border-border hover:border-primary/40",
              )}
              onClick={() => setViewDays(d)}
            >
              {d}d
            </Button>
          ))}
        </div>
      </div>

      {/* Gantt chart */}
      <div className="flex-1 min-h-0 overflow-auto border border-border bg-card">
        <div className="flex min-w-max">
          {/* Left label column */}
          <div className="shrink-0 sticky left-0 z-20 bg-card border-r border-border" style={{ width: LABEL_W }}>
            {/* Month header spacer */}
            <div className="h-8 border-b border-border bg-card/90 flex items-center px-2">
              <span className="text-[9px] tracking-widest text-muted-foreground uppercase">Plan</span>
            </div>
            {timelineRows.length === 0 && (
              <div className="px-3 py-4 text-[10px] text-muted-foreground">
                No milestones yet.
              </div>
            )}
            {timelineRows.map((row) => {
              if (row.kind === "scope") {
                const scopeItems = items.filter((item) => item.scopeId === row.scope.id && item.status !== "cancelled");
                const doneItems = scopeItems.filter((item) => item.status === "done").length;
                const pct = scopeItems.length > 0 ? Math.round((doneItems / scopeItems.length) * 100) : 0;
                return (
                  <div
                    key={`scope-${row.scope.id}`}
                    className="border-b border-border bg-muted/20 flex items-center gap-2 px-2"
                    style={{ height: SCOPE_ROW_H }}
                  >
                    <span className="h-2 w-2 border border-primary/60 bg-primary/20" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[10px] font-bold uppercase tracking-widest text-primary/80">
                        {row.scope.name}
                      </p>
                      <p className="truncate text-[9px] text-muted-foreground">
                        {scopeItems.length} items · {pct}% done
                      </p>
                    </div>
                  </div>
                );
              }
              const m = row.milestone;
              const pct = m.itemCount > 0 ? Math.round((m.doneCount / m.itemCount) * 100) : 0;
              const done = m.status === "complete";
              return (
                <div
                  key={m.id}
                  className="border-b border-border flex items-center gap-2 px-2 group"
                  style={{ height: ROW_H }}
                >
                  <Flag className={cn("h-3 w-3 shrink-0", done ? "text-primary" : "text-muted-foreground")} />
                  <div className="flex-1 min-w-0">
                    <p className={cn("text-[11px] truncate leading-none", done ? "text-primary line-through" : "text-foreground")}>
                      {m.name}
                    </p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <div className="flex-1 h-1 bg-muted rounded-none overflow-hidden">
                        <div
                          className="h-full bg-primary transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="text-[9px] text-muted-foreground shrink-0">{pct}%</span>
                    </div>
                  </div>
                  <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                    <button
                      onClick={() => openEdit(m)}
                      className="text-muted-foreground hover:text-primary p-0.5"
                    >
                      <Pencil className="h-2.5 w-2.5" />
                    </button>
                    <button
                      onClick={() => setDeleteTarget(m)}
                      className="text-muted-foreground hover:text-destructive p-0.5"
                    >
                      <Trash2 className="h-2.5 w-2.5" />
                    </button>
                  </div>
                </div>
              );
            })}

            {/* Items with due dates header */}
            {datedItems.length > 0 && (
              <div className="h-7 border-b border-border bg-muted/30 flex items-center px-2">
                <span className="text-[9px] tracking-widest text-muted-foreground uppercase flex items-center gap-1">
                  <CheckSquare className="h-2.5 w-2.5" /> Due dates
                </span>
              </div>
            )}
            {datedItems.map((item) => (
              <div key={item.id} className="border-b border-border flex items-center px-2" style={{ height: ITEM_ROW_H }}>
                <span className="text-[10px] text-muted-foreground truncate">
                  #{item.number} {item.title}
                </span>
                {item.milestoneId && (
                  <span className="ml-2 max-w-20 truncate text-[9px] text-accent/70">
                    {milestoneById.get(item.milestoneId)?.name}
                  </span>
                )}
              </div>
            ))}
          </div>

          {/* Right scrollable grid */}
          <div className="relative" style={{ width: gridW }}>
            {/* Month headers row */}
            <div className="h-8 border-b border-border sticky top-0 z-10 bg-card/95 flex">
              {monthHeaders.map((mh, i) => (
                <div
                  key={i}
                  className="border-r border-border/50 flex items-center px-2 shrink-0 overflow-hidden"
                  style={{ width: mh.spanDays * DAY_PX, marginLeft: i === 0 ? mh.startDay * DAY_PX : 0 }}
                >
                  <span className="text-[9px] tracking-widest text-muted-foreground uppercase whitespace-nowrap">
                    {mh.label}
                  </span>
                </div>
              ))}
            </div>

            {/* Week tick lines (background) */}
            {weekTicks.map((d) => (
              <div
                key={d}
                className="absolute top-8 bottom-0 border-l border-border/30 pointer-events-none"
                style={{ left: d * DAY_PX }}
              />
            ))}

            {/* Today marker */}
            {todayOffset >= 0 && todayOffset <= viewDays && (
              <div
                className="absolute top-8 bottom-0 border-l-2 border-primary/60 pointer-events-none z-10"
                style={{ left: todayOffset * DAY_PX }}
              >
                <span className="absolute top-0 left-1 text-[8px] text-primary/70 font-mono">TODAY</span>
              </div>
            )}

            {/* Scope envelopes and milestone bars */}
            {timelineRows.map((row) => {
              if (row.kind === "scope") {
                const startD = parseDate(row.scope.startDate);
                const endD = parseDate(row.scope.targetDate);
                const hasBar = !!(startD && endD && startD < endD);
                const barStart = startD ? clampToView(startD) : null;
                const barEnd = endD ? clampToView(endD) : null;

                return (
                  <div
                    key={`scope-${row.scope.id}`}
                    className="relative border-b border-border bg-muted/10"
                    style={{ height: SCOPE_ROW_H }}
                  >
                    {hasBar && barStart !== null && barEnd !== null && (
                      <div
                        className="absolute top-1/2 h-3 -translate-y-1/2 border border-primary/30 bg-primary/10"
                        style={{ left: barStart * DAY_PX, width: Math.max((barEnd - barStart) * DAY_PX, 6) }}
                      >
                        <div className="h-full bg-primary/10" />
                      </div>
                    )}
                  </div>
                );
              }

              const m = row.milestone;
              const startD = parseDate(m.startDate);
              const endD = parseDate(m.targetDate);
              const pct = m.itemCount > 0 ? (m.doneCount / m.itemCount) : 0;
              const done = m.status === "complete";

              // Diamond marker if no span (only target date)
              const hasBar = !!(startD && endD && startD < endD);
              const markerDay = endD ? clampToView(endD) : startD ? clampToView(startD) : null;

              const barStart = startD ? clampToView(startD) : null;
              const barEnd = endD ? clampToView(endD) : null;

              return (
                <div
                  key={m.id}
                  className="relative border-b border-border"
                  style={{ height: ROW_H }}
                >
                  {hasBar && barStart !== null && barEnd !== null && (
                    <>
                      {/* Background track */}
                      <div
                        className="absolute top-1/2 -translate-y-1/2 h-5 bg-primary/10 border border-primary/20"
                        style={{ left: barStart * DAY_PX, width: (barEnd - barStart) * DAY_PX }}
                      />
                      {/* Progress fill */}
                      <div
                        className={cn("absolute top-1/2 -translate-y-1/2 h-5", done ? "bg-primary/60" : "bg-primary/30")}
                        style={{ left: barStart * DAY_PX, width: (barEnd - barStart) * DAY_PX * pct }}
                      />
                      {/* Label inside bar */}
                      {(barEnd - barStart) * DAY_PX > 40 && (
                        <div
                          className="absolute top-1/2 -translate-y-1/2 h-5 flex items-center px-1.5 overflow-hidden pointer-events-none"
                          style={{ left: barStart * DAY_PX, width: (barEnd - barStart) * DAY_PX }}
                        >
                          <span className="text-[9px] text-primary/80 truncate">{m.name}</span>
                        </div>
                      )}
                      {/* Drag handle — start */}
                      <div
                        className="absolute top-1/2 -translate-y-1/2 w-2 h-5 cursor-ew-resize z-10 hover:bg-primary/30"
                        style={{ left: barStart * DAY_PX }}
                        onMouseDown={(e) => onBarMouseDown(e, m.id, "start", barStart)}
                      />
                      {/* Drag handle — end */}
                      <div
                        className="absolute top-1/2 -translate-y-1/2 w-2 h-5 cursor-ew-resize z-10 hover:bg-primary/30"
                        style={{ left: barEnd * DAY_PX - 8 }}
                        onMouseDown={(e) => onBarMouseDown(e, m.id, "end", barEnd)}
                      />
                    </>
                  )}

                  {/* Diamond marker (no bar or just a point) */}
                  {!hasBar && markerDay !== null && (
                    <div
                      className={cn(
                        "absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-3 rotate-45 border",
                        done ? "bg-primary border-primary" : "bg-primary/30 border-primary/60",
                      )}
                      style={{ left: markerDay * DAY_PX }}
                    />
                  )}
                </div>
              );
            })}

            {/* Item due-date rows */}
            {datedItems.length > 0 && (
              <div className="border-b border-border h-7 bg-muted/10" />
            )}
            {datedItems.map((item) => {
              const d = parseDate(item.dueDate);
              if (!d) return null;
              const off = clampToView(d);
              const overdue = d < today && item.status !== "done";
              const blockers = (item.blockedBy ?? [])
                .filter((b) => b.status !== "done" && b.status !== "cancelled")
                .map((b) => `#${b.number}`);
              const blocked =
                item.isBlocked === true &&
                item.status !== "done" &&
                item.status !== "cancelled";
              return (
                <div key={item.id} className="relative border-b border-border" style={{ height: ITEM_ROW_H }}>
                  <div
                    className={cn(
                      "absolute top-1/2 -translate-y-1/2 -translate-x-1/2 flex items-center gap-1",
                    )}
                    style={{ left: off * DAY_PX }}
                    title={blocked ? `blocked by ${blockers.join(", ")}` : undefined}
                  >
                    <div
                      className={cn(
                        "w-2 h-2 rounded-full border",
                        item.status === "done" ? "bg-primary border-primary" :
                        blocked ? "bg-yellow-500/70 border-yellow-500" :
                        overdue ? "bg-destructive border-destructive" :
                        "bg-accent/50 border-accent",
                      )}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 mt-2 text-[9px] text-muted-foreground font-mono">
        <span className="flex items-center gap-1"><span className="w-3 h-2 bg-primary/30 inline-block" /> milestone bar (drag edges to resize)</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rotate-45 bg-primary/30 border border-primary/60 inline-block" /> point milestone</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-accent/50 border border-accent inline-block" /> item due date</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-destructive border border-destructive inline-block" /> overdue</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-yellow-500/70 border border-yellow-500 inline-block" /> blocked</span>
      </div>

      {/* ── Create milestone dialog ── */}
      <Dialog open={createOpen} onOpenChange={(o) => { if (!o) setCreateOpen(false); }}>
        <DialogContent className="bg-card border-border max-w-md">
          <DialogHeader>
            <DialogTitle className="font-['VT323'] tracking-widest text-xl text-primary">
              // NEW MILESTONE
            </DialogTitle>
          </DialogHeader>
          <MilestoneForm
            form={form}
            setForm={setForm}
            scopes={scopes}
            saving={saving}
            onSubmit={() => void submitCreate()}
            onCancel={() => setCreateOpen(false)}
            submitLabel="CREATE"
          />
        </DialogContent>
      </Dialog>

      {/* ── Edit milestone dialog ── */}
      <Dialog open={!!editMilestone} onOpenChange={(o) => { if (!o) setEditMilestone(null); }}>
        <DialogContent className="bg-card border-border max-w-md">
          <DialogHeader>
            <DialogTitle className="font-['VT323'] tracking-widest text-xl text-primary">
              // EDIT MILESTONE
            </DialogTitle>
          </DialogHeader>
          <MilestoneForm
            form={form}
            setForm={setForm}
            scopes={scopes}
            saving={saving}
            onSubmit={() => void submitEdit()}
            onCancel={() => setEditMilestone(null)}
            submitLabel="SAVE"
            hideScope
          />
          {/* Mark complete toggle */}
          {editMilestone && (
            <div className="pt-2 border-t border-border">
              <Button
                variant="ghost"
                size="sm"
                className="font-mono text-xs w-full rounded-none border border-border hover:border-primary/40"
                disabled={saving}
                onClick={() => void onUpdateMilestone(editMilestone.id, {
                  status: editMilestone.status === "complete" ? "open" : "complete",
                }).then(() => setEditMilestone(null))}
              >
                {editMilestone.status === "complete" ? "↩ REOPEN" : "✓ MARK COMPLETE"}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Delete confirmation dialog ── */}
      <Dialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}>
        <DialogContent className="bg-card border-border max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-['VT323'] tracking-widest text-xl text-destructive">
              // DELETE MILESTONE
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="font-mono text-sm">
              Delete <span className="text-primary font-bold">"{deleteTarget?.name}"</span>?
              Linked items will be unassigned. This cannot be undone.
            </p>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" className="font-mono text-xs rounded-none" onClick={() => setDeleteTarget(null)}>
                CANCEL
              </Button>
              <Button
                className="font-mono text-xs rounded-none bg-destructive text-destructive-foreground hover:bg-destructive/90"
                disabled={saving}
                onClick={() => void confirmDelete()}
              >
                {saving ? "DELETING..." : "DELETE"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Milestone form (shared by create + edit) ──────────────────────────────────

type FormState = {
  name: string;
  description: string;
  startDate: string;
  targetDate: string;
  scopeId: string;
};

function MilestoneForm({
  form,
  setForm,
  scopes,
  saving,
  onSubmit,
  onCancel,
  submitLabel,
  hideScope,
}: {
  form: FormState;
  setForm: React.Dispatch<React.SetStateAction<FormState>>;
  scopes: Scope[];
  saving: boolean;
  onSubmit: () => void;
  onCancel: () => void;
  submitLabel: string;
  hideScope?: boolean;
}) {
  return (
    <div className="space-y-3">
      <div>
        <label className="font-mono text-[10px] text-muted-foreground tracking-widest">NAME *</label>
        <Input
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          className="font-mono text-sm rounded-none mt-1 h-8"
          placeholder="Milestone name"
          onKeyDown={(e) => { if (e.key === "Enter") onSubmit(); }}
          autoFocus
        />
      </div>
      <div>
        <label className="font-mono text-[10px] text-muted-foreground tracking-widest">DESCRIPTION</label>
        <Textarea
          value={form.description}
          onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          className="font-mono text-xs rounded-none mt-1 min-h-[60px] resize-none"
          placeholder="Optional description..."
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="font-mono text-[10px] text-muted-foreground tracking-widest">START DATE</label>
          <Input
            type="date"
            value={form.startDate}
            onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))}
            className="font-mono text-xs rounded-none mt-1 h-8"
          />
        </div>
        <div>
          <label className="font-mono text-[10px] text-muted-foreground tracking-widest">TARGET DATE</label>
          <Input
            type="date"
            value={form.targetDate}
            onChange={(e) => setForm((f) => ({ ...f, targetDate: e.target.value }))}
            className="font-mono text-xs rounded-none mt-1 h-8"
          />
        </div>
      </div>
      {!hideScope && (
        <div>
          <label className="font-mono text-[10px] text-muted-foreground tracking-widest">SCOPE *</label>
          <Select value={form.scopeId} onValueChange={(v) => setForm((f) => ({ ...f, scopeId: v }))}>
            <SelectTrigger className="font-mono text-xs rounded-none mt-1 h-8">
              <SelectValue placeholder="Select scope..." />
            </SelectTrigger>
            <SelectContent>
              {scopes.map((s) => (
                <SelectItem key={s.id} value={String(s.id)} className="font-mono text-xs">
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
      <div className="flex gap-2 justify-end pt-1">
        <Button variant="outline" className="font-mono text-xs rounded-none" onClick={onCancel}>
          CANCEL
        </Button>
        <Button
          className="font-mono text-xs rounded-none bg-primary/10 border border-primary/40 text-primary hover:bg-primary/20"
          disabled={saving || !form.name.trim() || (!hideScope && !form.scopeId)}
          onClick={onSubmit}
        >
          {saving ? "SAVING..." : submitLabel}
        </Button>
      </div>
    </div>
  );
}
