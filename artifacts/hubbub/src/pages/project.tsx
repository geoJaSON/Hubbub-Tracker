import { useState, useEffect, useRef, useMemo } from "react";
import { useParams, Link } from "wouter";
import { useAuth } from "@clerk/react";
import {
  useGetProject, useListItems, useListMessages, usePostMessage,
  useListActivity, useListDocs, useCreateItem, useUpdateItem,
  useGetStandup, useCreateDoc, useUpdateDoc, useDeleteDoc,
  useUpdateProject, useDeleteProject,
  useGetBurnDown, useListCostEntries, useCreateCostEntry,
  useCreateScope, useCreateMilestone,
} from "@workspace/api-client-react";
import type {
  Item, Doc, ItemInput, ItemInputType, ItemInputPriority,
  ItemUpdateStatus, Message, DocInput, CostEntry, CostEntryInput,
  CostEntryInputCategory, Scope, Milestone, ScopeInput, MilestoneInput,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getListItemsQueryKey, getListMessagesQueryKey, getListActivityQueryKey,
  getListDocsQueryKey, getGetProjectQueryKey, getListCostEntriesQueryKey,
} from "@workspace/api-client-react";
import { Layout } from "../components/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import {
  Plus, Send, Bug, CheckSquare, Lightbulb, MessageSquare as ReqIcon,
  ArrowRight, FileText, Copy, Trash2, Pin, Pencil, Archive, Search,
  Flag, Layers,
} from "lucide-react";
import { cn } from "@/lib/utils";
import ReactMarkdown from "react-markdown";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

const STATUS_COLS = ["open", "in_progress", "blocked", "done"] as const;
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
const TYPE_ICONS: Record<string, typeof Bug> = {
  bug: Bug, todo: CheckSquare, decision: Lightbulb, request: ReqIcon,
};

type RichItem = Item & { projectSlug: string };

function ItemCard({
  item,
  onStatusChange,
  onDragStart,
}: {
  item: RichItem;
  onStatusChange: (id: number, status: ItemUpdateStatus) => void;
  onDragStart?: () => void;
}) {
  const Icon = TYPE_ICONS[item.type] ?? CheckSquare;
  return (
    <div
      draggable={!!onDragStart}
      onDragStart={onDragStart}
      className={cn(
        "border bg-card p-3 space-y-2 hover:border-primary/40 transition-colors",
        onDragStart && "cursor-grab active:cursor-grabbing",
        STATUS_COLORS[item.status] ?? "border-border",
      )}
    >
      <div className="flex items-start gap-2">
        <Icon className={cn("h-3.5 w-3.5 shrink-0 mt-0.5", PRIORITY_COLORS[item.priority])} />
        <Link href={`/projects/${item.projectSlug}/items/${item.number}`}>
          <a className="text-sm font-mono text-foreground hover:text-primary leading-tight line-clamp-2">
            #{item.number} {item.title}
          </a>
        </Link>
      </div>
      <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground">
        <span>{item.type}</span>
        <span>·</span>
        <span>{item.priority}</span>
        {item.assignee && (
          <>
            <span>·</span>
            <span className="text-primary">{item.assignee.displayName?.slice(0, 10)}</span>
          </>
        )}
      </div>
      <div className="flex gap-1 flex-wrap">
        {STATUS_COLS.filter((s) => s !== item.status).map((s) => (
          <button
            key={s}
            onClick={(e) => { e.preventDefault(); onStatusChange(item.id, s as ItemUpdateStatus); }}
            className="text-[10px] font-mono text-muted-foreground hover:text-primary border border-transparent hover:border-primary/30 px-1 transition-colors"
          >
            → {STATUS_LABELS[s]}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function ProjectPage() {
  const { slug, tab } = useParams<{ slug: string; tab?: string }>();
  const [activeTab, setActiveTab] = useState(tab ?? "items");
  const qc = useQueryClient();
  const { toast } = useToast();
  const { getToken } = useAuth();

  const { data: project, isLoading: projLoading } = useGetProject(slug!);
  const { data: itemsData = [] } = useListItems(slug!);
  const { data: messagesData = [] } = useListMessages(slug!);
  const { data: activity = [] } = useListActivity(slug!);
  const { data: docs = [] } = useListDocs(slug!);
  const { data: standup } = useGetStandup();
  const postMessage = usePostMessage();
  const createItem = useCreateItem();
  const updateItem = useUpdateItem();
  const createDoc = useCreateDoc();
  const updateDoc = useUpdateDoc();
  const deleteDoc = useDeleteDoc();
  const updateProject = useUpdateProject();
  const deleteProjectMut = useDeleteProject();
  const createCostEntry = useCreateCostEntry();
  const { data: burnDown } = useGetBurnDown(slug!);
  const { data: costEntries = [] } = useListCostEntries(slug!);

  const [chatMsg, setChatMsg] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [draggedItemId, setDraggedItemId] = useState<number | null>(null);
  const [dragTarget, setDragTarget] = useState<string | null>(null);
  const [itemTypeFilter, setItemTypeFilter] = useState<string>("all");
  const [docOpen, setDocOpen] = useState(false);
  const [editDoc, setEditDoc] = useState<Doc | null>(null);
  const [docForm, setDocForm] = useState({ title: "", body: "" });
  const [costOpen, setCostOpen] = useState(false);
  const [newCost, setNewCost] = useState<{
    category: CostEntryInputCategory;
    vendor: string;
    description: string;
    amountCents: string;
  }>({ category: "other", vendor: "", description: "", amountCents: "" });
  const [newItem, setNewItem] = useState<{
    type: ItemInputType;
    title: string;
    priority: ItemInputPriority;
    description: string;
  }>({ type: "todo", title: "", priority: "medium", description: "" });

  const [docSearch, setDocSearch] = useState("");
  const [scopeOpen, setScopeOpen] = useState(false);
  const [newScope, setNewScope] = useState({ name: "", budgetCents: "", startDate: "", targetDate: "" });
  const [milestoneOpen, setMilestoneOpen] = useState(false);
  const [newMilestone, setNewMilestone] = useState({ name: "", scopeId: "", targetDate: "" });
  const createScope = useCreateScope();
  const createMilestone = useCreateMilestone();

  // SSE live chat: accumulate messages that arrive over the stream
  const [sseMessages, setSseMessages] = useState<Message[]>([]);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setSseMessages([]); // reset on slug change
  }, [slug]);

  useEffect(() => {
    if (activeTab !== "chat") return;

    let es: EventSource | null = null;

    const connect = async () => {
      const token = await getToken();
      // EventSource uses cookie-based Clerk auth (same-origin via Vite proxy)
      // We add the token as a header workaround via fetchEventSource if cookies
      // don't propagate; for now rely on Clerk's __session cookie.
      void token; // obtained but not needed when cookies flow through proxy
      es = new EventSource(
        `${window.location.origin}${basePath}/api/projects/${slug}/messages/stream`,
      );

      es.onmessage = (evt) => {
        try {
          const payload = JSON.parse(evt.data) as { type: string; message?: Message };
          if (payload.type === "message" && payload.message) {
            setSseMessages((prev) => {
              if (prev.some((m) => m.id === payload.message!.id)) return prev;
              return [...prev, payload.message!];
            });
          }
        } catch { /* ignore malformed */ }
      };

      es.onerror = () => {
        // auto-reconnects are handled by EventSource; close on component unmount
      };
    };

    void connect();
    return () => { es?.close(); };
  }, [slug, activeTab, getToken]);

  // Merge query messages + SSE messages, dedup by id
  const allMessages = useMemo<Message[]>(() => {
    const base = (messagesData as Message[]);
    const existing = new Set(base.map((m) => m.id));
    return [...base, ...sseMessages.filter((m) => !existing.has(m.id))];
  }, [messagesData, sseMessages]);

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    if (activeTab === "chat") {
      chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [allMessages, activeTab]);

  const items: RichItem[] = itemsData.map((i) => ({ ...i, projectSlug: slug! }));

  const docSearchFiltered = useMemo<Doc[]>(() => {
    const q = docSearch.trim().toLowerCase();
    return [...(docs as Doc[])]
      .filter((d) => !q || d.title.toLowerCase().includes(q) || (d.body ?? "").toLowerCase().includes(q))
      .sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));
  }, [docs, docSearch]);

  const handleSendMsg = async () => {
    if (!chatMsg.trim()) return;
    await postMessage.mutateAsync({ slug, data: { body: chatMsg } });
    // SSE will deliver the reply; also invalidate for non-SSE clients
    qc.invalidateQueries({ queryKey: getListMessagesQueryKey(slug!) });
    setChatMsg("");
  };

  const handleCreateItem = async () => {
    if (!newItem.title.trim()) return;
    try {
      const payload: ItemInput = {
        type: newItem.type,
        title: newItem.title,
        priority: newItem.priority,
        description: newItem.description || null,
      };
      await createItem.mutateAsync({ slug, data: payload });
      qc.invalidateQueries({ queryKey: getListItemsQueryKey(slug!) });
      setCreateOpen(false);
      setNewItem({ type: "todo", title: "", priority: "medium", description: "" });
      toast({ title: "Item created" });
    } catch {
      toast({ title: "Failed to create item", variant: "destructive" });
    }
  };

  const handleSaveDoc = async () => {
    if (!docForm.title.trim()) return;
    try {
      if (editDoc) {
        await updateDoc.mutateAsync({ slug: slug!, docSlug: editDoc.slug, data: { title: docForm.title, body: docForm.body } });
      } else {
        const docSlug = docForm.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || `doc-${Date.now()}`;
        const input: DocInput = { title: docForm.title, slug: docSlug, body: docForm.body };
        await createDoc.mutateAsync({ slug: slug!, data: input });
      }
      qc.invalidateQueries({ queryKey: getListDocsQueryKey(slug!) });
      setDocOpen(false);
      setEditDoc(null);
      setDocForm({ title: "", body: "" });
      toast({ title: editDoc ? "Doc updated" : "Doc created" });
    } catch {
      toast({ title: "Failed to save doc", variant: "destructive" });
    }
  };

  const handleDeleteDoc = async (doc: Doc) => {
    if (!window.confirm(`Delete "${doc.title}"?`)) return;
    try {
      await deleteDoc.mutateAsync({ slug: slug!, docSlug: doc.slug });
      qc.invalidateQueries({ queryKey: getListDocsQueryKey(slug!) });
      toast({ title: "Doc deleted" });
    } catch {
      toast({ title: "Failed to delete doc", variant: "destructive" });
    }
  };

  const handleTogglePin = async (doc: Doc) => {
    await updateDoc.mutateAsync({ slug: slug!, docSlug: doc.slug, data: { pinned: !doc.pinned } });
    qc.invalidateQueries({ queryKey: getListDocsQueryKey(slug!) });
  };

  const handleArchiveProject = async (archived: boolean) => {
    await updateProject.mutateAsync({ slug: slug!, data: { archived } });
    qc.invalidateQueries({ queryKey: getGetProjectQueryKey(slug!) });
  };

  const handleDeleteProject = async () => {
    if (!window.confirm(`Permanently delete project "${project?.name}"? This cannot be undone.`)) return;
    try {
      await deleteProjectMut.mutateAsync({ slug: slug! });
      window.location.href = `${window.location.origin}${basePath}/projects`;
    } catch {
      toast({ title: "Failed to delete project", variant: "destructive" });
    }
  };

  const handleAddCost = async () => {
    const amount = parseFloat(newCost.amountCents);
    if (!amount || isNaN(amount)) return;
    try {
      const input: CostEntryInput = {
        category: newCost.category,
        vendor: newCost.vendor || undefined,
        description: newCost.description || undefined,
        amountCents: Math.round(amount * 100),
        incurredOn: new Date().toISOString().split("T")[0]!,
      };
      await createCostEntry.mutateAsync({ slug: slug!, data: input });
      qc.invalidateQueries({ queryKey: getListCostEntriesQueryKey(slug!) });
      setCostOpen(false);
      setNewCost({ category: "other", vendor: "", description: "", amountCents: "" });
      toast({ title: "Cost entry added" });
    } catch {
      toast({ title: "Failed to add cost entry", variant: "destructive" });
    }
  };

  const handleCreateScope = async () => {
    if (!newScope.name.trim()) return;
    try {
      const scopeSlug = newScope.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || `scope-${Date.now()}`;
      const input: ScopeInput = {
        name: newScope.name,
        slug: scopeSlug,
        budgetCents: newScope.budgetCents ? Math.round(parseFloat(newScope.budgetCents) * 100) : null,
        startDate: newScope.startDate || null,
        targetDate: newScope.targetDate || null,
      };
      await createScope.mutateAsync({ slug: slug!, data: input });
      qc.invalidateQueries({ queryKey: getGetProjectQueryKey(slug!) });
      setScopeOpen(false);
      setNewScope({ name: "", budgetCents: "", startDate: "", targetDate: "" });
      toast({ title: "Scope created" });
    } catch {
      toast({ title: "Failed to create scope", variant: "destructive" });
    }
  };

  const handleCreateMilestone = async () => {
    if (!newMilestone.name.trim() || !newMilestone.scopeId) return;
    try {
      const input: MilestoneInput = {
        name: newMilestone.name,
        scopeId: parseInt(newMilestone.scopeId, 10),
        targetDate: newMilestone.targetDate || null,
      };
      await createMilestone.mutateAsync({ slug: slug!, data: input });
      qc.invalidateQueries({ queryKey: getGetProjectQueryKey(slug!) });
      setMilestoneOpen(false);
      setNewMilestone({ name: "", scopeId: "", targetDate: "" });
      toast({ title: "Milestone created" });
    } catch {
      toast({ title: "Failed to create milestone", variant: "destructive" });
    }
  };

  const handleStatusChange = async (itemId: number, status: ItemUpdateStatus) => {
    const item = items.find((i) => i.id === itemId);
    if (!item) return;
    await updateItem.mutateAsync({ slug, itemNumber: item.number, data: { status } });
    qc.invalidateQueries({ queryKey: getListItemsQueryKey(slug!) });
  };

  if (projLoading) {
    return (
      <Layout title={slug.toUpperCase()}>
        <div className="font-mono text-muted-foreground animate-pulse">LOADING...</div>
      </Layout>
    );
  }

  if (!project) {
    return (
      <Layout title="ERROR">
        <div className="font-mono text-destructive">PROJECT NOT FOUND</div>
      </Layout>
    );
  }

  return (
    <Layout title={project.name.toUpperCase()}>
      <div className="space-y-4 max-w-6xl">
        {/* Project header */}
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-muted-foreground font-mono text-xs">{project.slug}</span>
          {project.description && (
            <span className="text-xs text-muted-foreground font-mono">— {project.description}</span>
          )}
          {project.archived && (
            <span className="border border-border text-muted-foreground font-mono text-xs px-2 py-0.5">
              ARCHIVED
            </span>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto text-xs font-mono border border-primary/50 text-primary hover:bg-primary/10 gap-1"
            onClick={() => setCreateOpen(true)}
          >
            <Plus className="h-3 w-3" /> NEW ITEM
          </Button>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="bg-card border border-border rounded-none h-8 p-0 gap-0">
            {[
              { value: "items", label: "ITEMS" },
              { value: "board", label: "BOARD" },
              { value: "chat", label: "CHAT" },
              { value: "docs", label: "DOCS" },
              { value: "activity", label: "ACTIVITY" },
              { value: "standup", label: "STANDUP" },
              { value: "members", label: "MEMBERS" },
              { value: "budget", label: "BUDGET" },
              { value: "settings", label: "SETTINGS" },
            ].map((t) => (
              <TabsTrigger
                key={t.value}
                value={t.value}
                className="rounded-none h-full px-3 text-xs font-mono tracking-wider data-[state=active]:bg-primary/10 data-[state=active]:text-primary border-r border-border last:border-0"
              >
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>

          {/* ITEMS TAB */}
          <TabsContent value="items" className="mt-3 space-y-2">
            {/* Type filter */}
            <div className="flex gap-1 flex-wrap">
              {[
                { id: "all", label: "ALL" },
                { id: "todo", label: "TODO" },
                { id: "bug", label: "BUG" },
                { id: "decision", label: "DECISION LOG" },
                { id: "request", label: "REQUEST" },
              ].map((f) => (
                <button
                  key={f.id}
                  onClick={() => setItemTypeFilter(f.id)}
                  className={cn(
                    "text-[10px] font-mono border px-2 py-0.5 transition-colors",
                    itemTypeFilter === f.id
                      ? "border-primary text-primary bg-primary/10"
                      : "border-border text-muted-foreground hover:text-foreground hover:border-muted-foreground",
                  )}
                >
                  {f.label}
                </button>
              ))}
            </div>
            {(() => {
              const filtered = itemTypeFilter === "all"
                ? items
                : items.filter((i) => i.type === itemTypeFilter);
              return filtered.length === 0 ? (
                <div className="border border-border bg-card p-8 text-center">
                  <p className="text-muted-foreground font-mono text-sm">
                    {itemTypeFilter === "all" ? "no items yet" : `no ${itemTypeFilter} items`}
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-border border border-border bg-card">
                  {filtered.map((item) => (
                    <Link key={item.id} href={`/projects/${slug}/items/${item.number}`}>
                      <a className="flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors group">
                        {(() => {
                          const Icon = TYPE_ICONS[item.type] ?? CheckSquare;
                          return <Icon className={cn("h-3.5 w-3.5 shrink-0", PRIORITY_COLORS[item.priority])} />;
                        })()}
                        <span className="text-xs text-muted-foreground font-mono w-8">#{item.number}</span>
                        <span className="flex-1 font-mono text-sm text-foreground truncate">{item.title}</span>
                        {item.type === "decision" && item.decisionRationale && (
                          <span className="hidden md:block text-xs text-muted-foreground font-mono truncate max-w-[200px]">
                            {String(item.decisionRationale).slice(0, 60)}
                          </span>
                        )}
                        <span className={cn("text-xs font-mono border px-1.5 py-0.5", STATUS_COLORS[item.status])}>
                          {STATUS_LABELS[item.status] ?? item.status}
                        </span>
                        <span className="text-xs text-muted-foreground font-mono hidden sm:block">{item.type}</span>
                        <ArrowRight className="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary transition-colors" />
                      </a>
                    </Link>
                  ))}
                </div>
              );
            })()}
          </TabsContent>

          {/* BOARD TAB — drag-and-drop */}
          <TabsContent value="board" className="mt-3">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 overflow-x-auto">
              {STATUS_COLS.map((col) => {
                const colItems = items.filter((i) => i.status === col);
                const isTarget = dragTarget === col;
                return (
                  <div
                    key={col}
                    className={cn(
                      "space-y-2 min-w-40 border rounded-none p-1 transition-colors",
                      isTarget
                        ? "border-primary/50 bg-primary/5"
                        : "border-transparent",
                    )}
                    onDragOver={(e) => { e.preventDefault(); setDragTarget(col); }}
                    onDragLeave={(e) => {
                      if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                        setDragTarget(null);
                      }
                    }}
                    onDrop={() => {
                      if (draggedItemId !== null) {
                        void handleStatusChange(draggedItemId, col as ItemUpdateStatus);
                        setDraggedItemId(null);
                        setDragTarget(null);
                      }
                    }}
                  >
                    <div className={cn("text-xs font-mono tracking-widest border-b pb-1", STATUS_COLORS[col])}>
                      {STATUS_LABELS[col]} ({colItems.length})
                    </div>
                    <div className="space-y-2">
                      {colItems.map((item) => (
                        <ItemCard
                          key={item.id}
                          item={item}
                          onStatusChange={handleStatusChange}
                          onDragStart={() => setDraggedItemId(item.id)}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </TabsContent>

          {/* CHAT TAB — SSE live */}
          <TabsContent value="chat" className="mt-3">
            <div className="border border-border bg-card flex flex-col h-[500px]">
              <div className="flex-1 overflow-y-auto p-3 space-y-2 font-mono text-sm">
                {allMessages.length === 0 ? (
                  <p className="text-muted-foreground text-xs">
                    no messages yet — try /todo, /bug, /close, /assign
                  </p>
                ) : (
                  allMessages.map((m) => (
                    <div
                      key={m.id}
                      className={cn("flex gap-2", m.authorId === "system" && "opacity-70")}
                    >
                      <span className={m.authorId === "system" ? "text-accent shrink-0" : "text-primary shrink-0"}>
                        {m.authorId === "system" ? "sys" : ">"}
                      </span>
                      <div>
                        {m.authorId !== "system" && (
                          <span className="text-xs text-accent mr-2">
                            {(m.author as { displayName?: string } | null)?.displayName ?? "USER"}
                          </span>
                        )}
                        <span className="text-foreground">
                          {m.body.split(/(@\w+|#\d+)/g).map((part, pi) =>
                            part.startsWith("@")
                              ? <span key={pi} className="text-accent font-bold">{part}</span>
                              : part.startsWith("#") && /^#\d+$/.test(part)
                                ? (
                                  <Link key={pi} href={`/projects/${slug}/items/${part.slice(1)}`}>
                                    <a className="text-primary font-bold hover:underline">{part}</a>
                                  </Link>
                                )
                                : part
                          )}
                        </span>
                        <span className="text-muted-foreground text-xs ml-2">
                          {new Date(m.createdAt).toLocaleTimeString()}
                        </span>
                      </div>
                    </div>
                  ))
                )}
                <div ref={chatEndRef} />
              </div>
              <div className="border-t border-border p-2 flex gap-2">
                <span className="text-primary font-mono text-sm self-center">$</span>
                <input
                  value={chatMsg}
                  onChange={(e) => setChatMsg(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && void handleSendMsg()}
                  className="flex-1 bg-transparent font-mono text-sm text-foreground outline-none placeholder:text-muted-foreground"
                  placeholder="message or /todo /bug /close /assign..."
                />
                <button
                  onClick={() => void handleSendMsg()}
                  disabled={!chatMsg.trim() || postMessage.isPending}
                  className="text-primary hover:text-primary/80 disabled:text-muted-foreground"
                >
                  <Send className="h-4 w-4" />
                </button>
              </div>
            </div>
          </TabsContent>

          {/* DOCS TAB — full CRUD + search */}
          <TabsContent value="docs" className="mt-3 space-y-3">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground pointer-events-none" />
                <Input
                  value={docSearch}
                  onChange={(e) => setDocSearch(e.target.value)}
                  className="pl-6 h-8 bg-background border-border font-mono text-xs"
                  placeholder="search docs..."
                />
              </div>
              <Button
                size="sm"
                variant="ghost"
                className="font-mono text-xs border border-primary/50 text-primary hover:bg-primary/10 gap-1 shrink-0"
                onClick={() => { setEditDoc(null); setDocForm({ title: "", body: "" }); setDocOpen(true); }}
              >
                <Plus className="h-3 w-3" /> NEW DOC
              </Button>
            </div>
            {docSearchFiltered.length === 0 ? (
              <div className="border border-border bg-card p-6 text-center text-muted-foreground font-mono text-sm">
                {docSearch.trim() ? `no docs matching "${docSearch.trim()}"` : "no docs yet — create one above"}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {docSearchFiltered.map((doc) => (
                  <div key={doc.id} className="border border-border bg-card p-4 flex flex-col gap-2 hover:border-primary/40 transition-colors">
                    <div className="flex items-center gap-2">
                      <FileText className="h-3.5 w-3.5 text-primary shrink-0" />
                      <span className="font-mono text-sm text-foreground truncate flex-1">{doc.title}</span>
                      {doc.pinned && (
                        <span className="text-[10px] font-mono text-accent border border-accent/50 px-1 shrink-0">PINNED</span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground font-mono line-clamp-3 flex-1">
                      {doc.body?.slice(0, 120) || "(empty)"}
                    </p>
                    <div className="flex items-center gap-1 pt-1 border-t border-border">
                      <span className="text-[10px] text-muted-foreground font-mono flex-1">
                        {doc.updatedAt ? new Date(doc.updatedAt).toLocaleDateString() : "—"}
                      </span>
                      <button
                        title={doc.pinned ? "Unpin" : "Pin"}
                        onClick={() => void handleTogglePin(doc)}
                        className={cn("p-1 rounded hover:bg-muted transition-colors", doc.pinned ? "text-accent" : "text-muted-foreground hover:text-foreground")}
                      >
                        <Pin className="h-3 w-3" />
                      </button>
                      <button
                        title="Edit"
                        onClick={() => { setEditDoc(doc); setDocForm({ title: doc.title, body: doc.body }); setDocOpen(true); }}
                        className="p-1 rounded text-muted-foreground hover:text-primary hover:bg-muted transition-colors"
                      >
                        <Pencil className="h-3 w-3" />
                      </button>
                      <button
                        title="Delete"
                        onClick={() => void handleDeleteDoc(doc)}
                        className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-muted transition-colors"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          {/* ACTIVITY TAB */}
          <TabsContent value="activity" className="mt-3">
            <div className="border border-border bg-card divide-y divide-border">
              {(activity as Array<{ id: number; type: string; createdAt: string }>).length === 0 ? (
                <div className="p-6 text-center text-muted-foreground font-mono text-sm">no activity</div>
              ) : (
                (activity as Array<{ id: number; type: string; createdAt: string }>).map((e) => (
                  <div key={e.id} className="flex items-start gap-3 px-4 py-2.5 text-xs font-mono">
                    <span className="text-primary shrink-0">EVENT</span>
                    <span className="text-foreground">{e.type.replace(/_/g, " ")}</span>
                    <span className="text-muted-foreground ml-auto shrink-0">
                      {new Date(e.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                ))
              )}
            </div>
          </TabsContent>

          {/* STANDUP TAB */}
          <TabsContent value="standup" className="mt-3 space-y-2">
            {standup && (
              <div className="flex justify-end">
                <Button
                  size="sm"
                  variant="ghost"
                  className="font-mono text-xs border border-border text-muted-foreground hover:text-primary hover:border-primary/50 gap-1"
                  onClick={() => {
                    void navigator.clipboard.writeText(standup.content);
                    toast({ title: "Standup copied to clipboard" });
                  }}
                >
                  <Copy className="h-3 w-3" /> COPY
                </Button>
              </div>
            )}
            <div className="border border-border bg-card p-4">
              {standup ? (
                <div className="prose prose-sm prose-invert font-mono max-w-none text-foreground [&_h2]:text-primary [&_h2]:font-['VT323'] [&_h2]:text-xl [&_strong]:text-accent">
                  <ReactMarkdown>{standup.content}</ReactMarkdown>
                </div>
              ) : (
                <p className="text-muted-foreground font-mono text-sm animate-pulse">GENERATING STANDUP...</p>
              )}
            </div>
          </TabsContent>

          {/* BUDGET TAB — burn-down + cost entries */}
          <TabsContent value="budget" className="mt-3 space-y-4">
            {/* Summary bar */}
            {burnDown ? (
              <div className="border border-border bg-card p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs tracking-widest text-primary">// BUDGET OVERVIEW</span>
                  <span className="font-mono text-xs text-muted-foreground">
                    ${((burnDown as { totalSpentCents: number }).totalSpentCents / 100).toFixed(2)} /
                    ${((burnDown as { totalBudgetCents: number }).totalBudgetCents / 100).toFixed(2)}
                  </span>
                </div>
                <div className="w-full bg-muted h-2 rounded-none">
                  <div
                    className="bg-primary h-2 transition-all"
                    style={{
                      width: `${Math.min(
                        100,
                        (burnDown as { totalBudgetCents: number; totalSpentCents: number }).totalBudgetCents > 0
                          ? ((burnDown as { totalSpentCents: number }).totalSpentCents /
                              (burnDown as { totalBudgetCents: number }).totalBudgetCents) * 100
                          : 0,
                      )}%`,
                    }}
                  />
                </div>
                {/* Per-scope bars */}
                {(burnDown as { scopes: Array<{ scopeId: number; scopeName: string; budgetCents: number; spentCents: number }> }).scopes.length > 0 && (
                  <div className="space-y-2 pt-2 border-t border-border">
                    <span className="font-mono text-[10px] tracking-widest text-muted-foreground">SCOPES</span>
                    {(burnDown as { scopes: Array<{ scopeId: number; scopeName: string; budgetCents: number; spentCents: number }> }).scopes.map((s) => (
                      <div key={s.scopeId} className="space-y-1">
                        <div className="flex justify-between font-mono text-xs">
                          <span className="text-foreground truncate">{s.scopeName}</span>
                          <span className="text-muted-foreground shrink-0 ml-2">
                            ${(s.spentCents / 100).toFixed(2)} / ${(s.budgetCents / 100).toFixed(2)}
                          </span>
                        </div>
                        <div className="w-full bg-muted h-1">
                          <div
                            className="bg-accent h-1"
                            style={{
                              width: `${Math.min(100, s.budgetCents > 0 ? (s.spentCents / s.budgetCents) * 100 : 0)}%`,
                            }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="border border-border bg-card p-4 text-center text-muted-foreground font-mono text-sm">
                no budget data — add scopes and assign budgets
              </div>
            )}

            {/* Cost entries */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs tracking-widest text-muted-foreground">// COST ENTRIES</span>
                <Button
                  size="sm"
                  variant="ghost"
                  className="font-mono text-xs border border-primary/50 text-primary hover:bg-primary/10 gap-1"
                  onClick={() => setCostOpen(true)}
                >
                  <Plus className="h-3 w-3" /> ADD COST
                </Button>
              </div>
              {(costEntries as CostEntry[]).length === 0 ? (
                <div className="border border-border bg-card p-6 text-center text-muted-foreground font-mono text-sm">
                  no cost entries yet
                </div>
              ) : (
                <div className="border border-border bg-card divide-y divide-border">
                  {(costEntries as CostEntry[]).map((c) => (
                    <div key={c.id} className="flex items-center gap-3 px-4 py-2.5 font-mono text-xs">
                      <span className="text-accent border border-accent/40 px-1 uppercase shrink-0">{c.category}</span>
                      <span className="flex-1 text-foreground truncate">{c.description ?? c.vendor ?? "—"}</span>
                      {c.vendor && c.description && (
                        <span className="text-muted-foreground hidden md:block truncate max-w-[120px]">{c.vendor}</span>
                      )}
                      <span className="text-foreground shrink-0 font-bold">${(c.amountCents / 100).toFixed(2)}</span>
                      <span className="text-muted-foreground shrink-0">{new Date(c.incurredOn).toLocaleDateString()}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Scopes */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs tracking-widest text-muted-foreground">// SCOPES</span>
                <Button size="sm" variant="ghost"
                  className="font-mono text-xs border border-primary/50 text-primary hover:bg-primary/10 gap-1"
                  onClick={() => setScopeOpen(true)}>
                  <Plus className="h-3 w-3" /> NEW SCOPE
                </Button>
              </div>
              {(project.scopes as Scope[]).length === 0 ? (
                <div className="border border-border bg-card p-4 text-center text-muted-foreground font-mono text-sm">
                  no scopes — add one to track work packages and budgets
                </div>
              ) : (
                <div className="border border-border bg-card divide-y divide-border">
                  {(project.scopes as Scope[]).map((s) => (
                    <div key={s.id} className="flex items-center gap-3 px-4 py-3 font-mono text-xs">
                      <Layers className="h-3.5 w-3.5 text-primary shrink-0" />
                      <span className="flex-1 text-foreground">{s.name}</span>
                      <span className={cn(
                        "border px-1 text-[10px]",
                        s.status === "active" ? "border-accent/50 text-accent" :
                        s.status === "complete" ? "border-primary/50 text-primary" :
                        "border-border text-muted-foreground",
                      )}>{s.status.toUpperCase()}</span>
                      {s.budgetCents != null && (
                        <span className="text-muted-foreground shrink-0">
                          ${((s.spentCents ?? 0) / 100).toFixed(0)} / ${(s.budgetCents / 100).toFixed(0)}
                        </span>
                      )}
                      {s.targetDate && <span className="text-muted-foreground shrink-0">{s.targetDate}</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Milestones */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs tracking-widest text-muted-foreground">// MILESTONES</span>
                <Button size="sm" variant="ghost"
                  className="font-mono text-xs border border-primary/50 text-primary hover:bg-primary/10 gap-1"
                  onClick={() => setMilestoneOpen(true)}
                  disabled={(project.scopes as Scope[]).length === 0}
                >
                  <Plus className="h-3 w-3" /> NEW MILESTONE
                </Button>
              </div>
              {(project.milestones as Milestone[]).length === 0 ? (
                <div className="border border-border bg-card p-4 text-center text-muted-foreground font-mono text-sm">
                  no milestones — create a scope first, then add milestones
                </div>
              ) : (
                <div className="border border-border bg-card divide-y divide-border">
                  {(project.milestones as Milestone[]).map((m) => (
                    <div key={m.id} className="flex items-center gap-3 px-4 py-3 font-mono text-xs">
                      <Flag className="h-3.5 w-3.5 text-accent shrink-0" />
                      <span className="flex-1 text-foreground">{m.name}</span>
                      <span className={cn(
                        "border px-1 text-[10px]",
                        m.status === "complete" ? "border-primary/50 text-primary" : "border-border text-muted-foreground",
                      )}>{m.status.toUpperCase()}</span>
                      {m.targetDate && <span className="text-muted-foreground shrink-0">{m.targetDate}</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </TabsContent>

          {/* SETTINGS TAB */}
          <TabsContent value="settings" className="mt-3">
            <div className="max-w-lg space-y-4">
              {/* Archive */}
              <div className="border border-border bg-card p-4 flex items-center gap-3">
                <Archive className="h-4 w-4 text-muted-foreground shrink-0" />
                <div className="flex-1">
                  <div className="font-mono text-sm text-foreground">Archive project</div>
                  <div className="text-xs text-muted-foreground font-mono">
                    Archived projects are hidden from the main list but preserved
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => void handleArchiveProject(!project?.archived)}
                  className={cn(
                    "font-mono text-xs border shrink-0",
                    project?.archived
                      ? "border-primary/50 text-primary hover:bg-primary/10"
                      : "border-border text-muted-foreground hover:text-foreground",
                  )}
                >
                  {project?.archived ? "UNARCHIVE" : "ARCHIVE"}
                </Button>
              </div>

              {/* Delete */}
              <div className="border border-destructive/30 bg-card p-4 flex items-center gap-3">
                <Trash2 className="h-4 w-4 text-destructive shrink-0" />
                <div className="flex-1">
                  <div className="font-mono text-sm text-destructive">Delete project</div>
                  <div className="text-xs text-muted-foreground font-mono">
                    Permanently removes this project and all its data. Cannot be undone.
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => void handleDeleteProject()}
                  disabled={deleteProjectMut.isPending}
                  className="font-mono text-xs border border-destructive/50 text-destructive hover:bg-destructive/10 shrink-0"
                >
                  {deleteProjectMut.isPending ? "DELETING..." : "DELETE"}
                </Button>
              </div>
            </div>
          </TabsContent>

          {/* MEMBERS TAB */}
          <TabsContent value="members" className="mt-3">
            <div className="border border-border bg-card divide-y divide-border">
              {(project.members ?? []).map((m) => (
                <div key={m.id} className="flex items-center gap-3 px-4 py-3">
                  <span className="h-2 w-2 rounded-full bg-primary" />
                  <span className="font-mono text-sm text-foreground">
                    {(m.user as { displayName?: string } | null)?.displayName ?? m.userId}
                  </span>
                  <span
                    className={cn(
                      "ml-auto text-xs font-mono border px-1.5 py-0.5",
                      m.role === "owner"
                        ? "border-accent/50 text-accent"
                        : "border-border text-muted-foreground",
                    )}
                  >
                    {m.role.toUpperCase()}
                  </span>
                </div>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* Create Item Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="bg-card border-border max-w-md">
          <DialogHeader>
            <DialogTitle className="font-['VT323'] tracking-widest text-xl text-primary">
              // NEW ITEM
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="font-mono text-xs tracking-widest text-muted-foreground">TYPE</Label>
                <Select
                  value={newItem.type}
                  onValueChange={(v) => setNewItem((p) => ({ ...p, type: v as ItemInputType }))}
                >
                  <SelectTrigger className="bg-background border-border font-mono text-xs h-8">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-card border-border font-mono text-xs">
                    {(["todo", "bug", "request", "decision"] as const).map((t) => (
                      <SelectItem key={t} value={t} className="font-mono text-xs">
                        {t.toUpperCase()}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="font-mono text-xs tracking-widest text-muted-foreground">PRIORITY</Label>
                <Select
                  value={newItem.priority}
                  onValueChange={(v) => setNewItem((p) => ({ ...p, priority: v as ItemInputPriority }))}
                >
                  <SelectTrigger className="bg-background border-border font-mono text-xs h-8">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-card border-border font-mono text-xs">
                    {(["low", "medium", "high", "urgent"] as const).map((t) => (
                      <SelectItem key={t} value={t} className="font-mono text-xs">
                        {t.toUpperCase()}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1">
              <Label className="font-mono text-xs tracking-widest text-muted-foreground">TITLE</Label>
              <Input
                value={newItem.title}
                onChange={(e) => setNewItem((p) => ({ ...p, title: e.target.value }))}
                className="bg-background border-border font-mono text-sm"
                placeholder="describe the item..."
              />
            </div>
            <div className="space-y-1">
              <Label className="font-mono text-xs tracking-widest text-muted-foreground">DESCRIPTION</Label>
              <Textarea
                value={newItem.description}
                onChange={(e) => setNewItem((p) => ({ ...p, description: e.target.value }))}
                className="bg-background border-border font-mono text-sm resize-none"
                rows={3}
              />
            </div>
            <div className="flex gap-2 pt-1">
              <Button
                onClick={() => void handleCreateItem()}
                disabled={!newItem.title.trim() || createItem.isPending}
                className="flex-1 bg-primary text-primary-foreground font-mono text-xs tracking-widest hover:bg-primary/90"
              >
                {createItem.isPending ? "CREATING..." : "CREATE"}
              </Button>
              <Button
                variant="ghost"
                onClick={() => setCreateOpen(false)}
                className="border border-border font-mono text-xs"
              >
                CANCEL
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add Cost Entry Dialog */}
      <Dialog open={costOpen} onOpenChange={setCostOpen}>
        <DialogContent className="bg-card border-border max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-['VT323'] tracking-widest text-xl text-primary">
              // ADD COST ENTRY
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="font-mono text-xs tracking-widest text-muted-foreground">CATEGORY</Label>
              <Select
                value={newCost.category}
                onValueChange={(v) => setNewCost((p) => ({ ...p, category: v as CostEntryInputCategory }))}
              >
                <SelectTrigger className="bg-background border-border font-mono text-xs h-8 rounded-none">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-card border-border">
                  {(["labor", "hosting", "saas", "contractor", "ai", "other"] as CostEntryInputCategory[]).map((c) => (
                    <SelectItem key={c} value={c} className="font-mono text-xs">{c.toUpperCase()}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="font-mono text-xs tracking-widest text-muted-foreground">VENDOR</Label>
              <Input
                value={newCost.vendor}
                onChange={(e) => setNewCost((p) => ({ ...p, vendor: e.target.value }))}
                className="bg-background border-border font-mono text-sm rounded-none"
                placeholder="optional"
              />
            </div>
            <div className="space-y-1">
              <Label className="font-mono text-xs tracking-widest text-muted-foreground">DESCRIPTION</Label>
              <Input
                value={newCost.description}
                onChange={(e) => setNewCost((p) => ({ ...p, description: e.target.value }))}
                className="bg-background border-border font-mono text-sm rounded-none"
                placeholder="optional"
              />
            </div>
            <div className="space-y-1">
              <Label className="font-mono text-xs tracking-widest text-muted-foreground">AMOUNT ($)</Label>
              <Input
                value={newCost.amountCents}
                onChange={(e) => setNewCost((p) => ({ ...p, amountCents: e.target.value }))}
                className="bg-background border-border font-mono text-sm rounded-none"
                placeholder="0.00"
                type="number"
                min="0"
                step="0.01"
              />
            </div>
            <div className="flex gap-2 justify-end">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setCostOpen(false)}
                className="font-mono text-xs text-muted-foreground"
              >
                CANCEL
              </Button>
              <Button
                size="sm"
                onClick={() => void handleAddCost()}
                disabled={!newCost.amountCents || createCostEntry.isPending}
                className="font-mono text-xs bg-primary text-primary-foreground hover:bg-primary/90"
              >
                {createCostEntry.isPending ? "SAVING..." : "ADD"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Create Scope Dialog */}
      <Dialog open={scopeOpen} onOpenChange={setScopeOpen}>
        <DialogContent className="bg-card border-border max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-['VT323'] tracking-widest text-xl text-primary">// NEW SCOPE</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="font-mono text-xs tracking-widest text-muted-foreground">NAME</Label>
              <Input value={newScope.name} onChange={(e) => setNewScope((p) => ({ ...p, name: e.target.value }))}
                className="bg-background border-border font-mono text-sm rounded-none" placeholder="scope name" />
            </div>
            <div className="space-y-1">
              <Label className="font-mono text-xs tracking-widest text-muted-foreground">BUDGET ($)</Label>
              <Input value={newScope.budgetCents} onChange={(e) => setNewScope((p) => ({ ...p, budgetCents: e.target.value }))}
                className="bg-background border-border font-mono text-sm rounded-none" placeholder="0.00" type="number" min="0" step="0.01" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="font-mono text-xs tracking-widest text-muted-foreground">START DATE</Label>
                <Input type="date" value={newScope.startDate} onChange={(e) => setNewScope((p) => ({ ...p, startDate: e.target.value }))}
                  className="bg-background border-border font-mono text-xs rounded-none h-8" />
              </div>
              <div className="space-y-1">
                <Label className="font-mono text-xs tracking-widest text-muted-foreground">TARGET DATE</Label>
                <Input type="date" value={newScope.targetDate} onChange={(e) => setNewScope((p) => ({ ...p, targetDate: e.target.value }))}
                  className="bg-background border-border font-mono text-xs rounded-none h-8" />
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="ghost" size="sm" onClick={() => setScopeOpen(false)} className="font-mono text-xs text-muted-foreground">CANCEL</Button>
              <Button size="sm" onClick={() => void handleCreateScope()} disabled={!newScope.name.trim() || createScope.isPending}
                className="font-mono text-xs bg-primary text-primary-foreground hover:bg-primary/90">
                {createScope.isPending ? "CREATING..." : "CREATE"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Create Milestone Dialog */}
      <Dialog open={milestoneOpen} onOpenChange={setMilestoneOpen}>
        <DialogContent className="bg-card border-border max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-['VT323'] tracking-widest text-xl text-primary">// NEW MILESTONE</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="font-mono text-xs tracking-widest text-muted-foreground">NAME</Label>
              <Input value={newMilestone.name} onChange={(e) => setNewMilestone((p) => ({ ...p, name: e.target.value }))}
                className="bg-background border-border font-mono text-sm rounded-none" placeholder="milestone name" />
            </div>
            <div className="space-y-1">
              <Label className="font-mono text-xs tracking-widest text-muted-foreground">SCOPE</Label>
              <Select value={newMilestone.scopeId} onValueChange={(v) => setNewMilestone((p) => ({ ...p, scopeId: v }))}>
                <SelectTrigger className="bg-background border-border font-mono text-xs h-8 rounded-none"><SelectValue placeholder="select scope" /></SelectTrigger>
                <SelectContent className="bg-card border-border">
                  {(project.scopes as Scope[]).map((s) => (
                    <SelectItem key={s.id} value={String(s.id)} className="font-mono text-xs">{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="font-mono text-xs tracking-widest text-muted-foreground">TARGET DATE</Label>
              <Input type="date" value={newMilestone.targetDate} onChange={(e) => setNewMilestone((p) => ({ ...p, targetDate: e.target.value }))}
                className="bg-background border-border font-mono text-xs rounded-none h-8" />
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="ghost" size="sm" onClick={() => setMilestoneOpen(false)} className="font-mono text-xs text-muted-foreground">CANCEL</Button>
              <Button size="sm" onClick={() => void handleCreateMilestone()} disabled={!newMilestone.name.trim() || !newMilestone.scopeId || createMilestone.isPending}
                className="font-mono text-xs bg-primary text-primary-foreground hover:bg-primary/90">
                {createMilestone.isPending ? "CREATING..." : "CREATE"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Doc Create / Edit Dialog */}
      <Dialog open={docOpen} onOpenChange={setDocOpen}>
        <DialogContent className="bg-card border-border max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-['VT323'] tracking-widest text-xl text-primary">
              {editDoc ? "// EDIT DOC" : "// NEW DOC"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <label className="font-mono text-xs tracking-widest text-muted-foreground">TITLE</label>
              <Input
                value={docForm.title}
                onChange={(e) => setDocForm((p) => ({ ...p, title: e.target.value }))}
                className="bg-background border-border font-mono text-sm rounded-none focus-visible:ring-primary"
                placeholder="doc title"
              />
            </div>
            <div className="space-y-1">
              <label className="font-mono text-xs tracking-widest text-muted-foreground">BODY (markdown)</label>
              <Textarea
                value={docForm.body}
                onChange={(e) => setDocForm((p) => ({ ...p, body: e.target.value }))}
                className="bg-background border-border font-mono text-sm rounded-none min-h-[200px] focus-visible:ring-primary"
                placeholder="write in markdown..."
              />
            </div>
            <div className="flex gap-2 justify-end">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setDocOpen(false)}
                className="font-mono text-xs text-muted-foreground"
              >
                CANCEL
              </Button>
              <Button
                size="sm"
                onClick={() => void handleSaveDoc()}
                disabled={!docForm.title.trim() || createDoc.isPending || updateDoc.isPending}
                className="font-mono text-xs bg-primary text-primary-foreground hover:bg-primary/90"
              >
                {editDoc ? "UPDATE" : "CREATE"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
