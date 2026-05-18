import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useParams, Link } from "wouter";
import { useAuth } from "@clerk/react";
import {
  useGetProject, useListItems, useListMessages, usePostMessage,
  useListActivity, useListDocs, useCreateItem, useUpdateItem,
  useGetStandup, useCreateDoc, useUpdateDoc, useDeleteDoc,
  useUpdateProject, useDeleteProject,
  useGetBurnDown, useListCostEntries, useCreateCostEntry,
  useCreateScope, useCreateMilestone,
  useListCommits, useListProjectTimeEntries, useCreateTimeEntry,
  useListPresence,
} from "@workspace/api-client-react";
import type {
  Item, Doc, ItemInput, ItemInputType, ItemInputPriority,
  ItemUpdateStatus, Message, DocInput, CostEntry, CostEntryInput,
  CostEntryInputCategory, Scope, Milestone, ScopeInput, MilestoneInput,
  Commit, TimeEntry, Presence,
} from "@workspace/api-client-react";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import {
  getListItemsQueryKey, getListMessagesQueryKey, getListActivityQueryKey,
  getListDocsQueryKey, getGetProjectQueryKey, getListCostEntriesQueryKey,
  getListCommitsQueryKey, getListPresenceQueryKey, getListProjectTimeEntriesQueryKey,
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
  Flag, Layers, GripVertical,
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

function TeletypeText({ text, onDone }: { text: string; onDone: () => void }) {
  const [idx, setIdx] = useState(0);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;
  const calledDone = useRef(false);

  useEffect(() => {
    if (calledDone.current) return;
    if (idx >= text.length) {
      calledDone.current = true;
      onDoneRef.current();
      return;
    }
    const t = setTimeout(() => setIdx((i) => i + 1), 14);
    return () => clearTimeout(t);
  }, [idx, text.length]);

  return <>{text.slice(0, idx)}<span className="animate-pulse">_</span></>;
}

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
  const { data: commits = [] } = useListCommits(slug!, {
    query: {
      queryKey: getListCommitsQueryKey(slug!),
      refetchInterval: 60_000,
      enabled: !!(slug && project?.githubRepo),
    },
  });
  const { data: timeEntries = [] } = useListProjectTimeEntries(slug!);
  const { data: presenceData = [] } = useListPresence({
    query: {
      queryKey: getListPresenceQueryKey(),
      refetchInterval: 30_000,
    },
  });

  // Filter to users seen within the last 60 seconds
  const onlineUsers = useMemo<Presence[]>(() => {
    const cutoff = Date.now() - 60_000;
    return presenceData.filter(
      (p) => new Date(p.updatedAt).getTime() >= cutoff,
    );
  }, [presenceData]);

  const [chatMsg, setChatMsg] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [draggedItemId, setDraggedItemId] = useState<number | null>(null);
  const [dragTarget, setDragTarget] = useState<string | null>(null);
  const [itemTypeFilter, setItemTypeFilter] = useState<string>("all");
  const [docOpen, setDocOpen] = useState(false);
  const [editDoc, setEditDoc] = useState<Doc | null>(null);
  const [docForm, setDocForm] = useState({ title: "", body: "" });
  const [docToDelete, setDocToDelete] = useState<Doc | null>(null);
  const [draggedDocSlug, setDraggedDocSlug] = useState<string | null>(null);
  const [dragOverDocSlug, setDragOverDocSlug] = useState<string | null>(null);
  const [localDocs, setLocalDocs] = useState<Doc[]>([]);
  const isDraggingDocRef = useRef(false);
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
  const [debouncedDocSearch, setDebouncedDocSearch] = useState("");
  const [githubRepoInput, setGithubRepoInput] = useState<string>("");
  const [githubTokenInput, setGithubTokenInput] = useState<string>("");

  useEffect(() => {
    setGithubRepoInput(project?.githubRepo ?? "");
  }, [project?.githubRepo]);

  // Debounce the doc search so we only fire the API call 350ms after typing stops
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedDocSearch(docSearch.trim()), 350);
    return () => clearTimeout(timer);
  }, [docSearch]);

  const [scopeOpen, setScopeOpen] = useState(false);
  const [newScope, setNewScope] = useState({ name: "", budgetCents: "", startDate: "", targetDate: "" });
  const [milestoneOpen, setMilestoneOpen] = useState(false);
  const [newMilestone, setNewMilestone] = useState({ name: "", scopeId: "", targetDate: "" });
  const createScope = useCreateScope();
  const createMilestone = useCreateMilestone();

  const [logTimeOpen, setLogTimeOpen] = useState(false);
  const [newTimeEntry, setNewTimeEntry] = useState({
    itemNumber: "",
    minutes: "",
    note: "",
    billable: true,
  });
  const createTimeEntry = useCreateTimeEntry();

  // SSE live chat: accumulate messages that arrive over the stream
  const [sseMessages, setSseMessages] = useState<Message[]>([]);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const [newMessageIds, setNewMessageIds] = useState<Set<number>>(new Set());
  // Track IDs already received via SSE to avoid double-adding without nested setState
  const sseSeenIds = useRef<Set<number>>(new Set());

  const markRevealed = useCallback((id: number) => {
    setNewMessageIds((ids) => {
      const next = new Set(ids);
      next.delete(id);
      return next;
    });
  }, []);

  useEffect(() => {
    setSseMessages([]); // reset on slug change
    setNewMessageIds(new Set());
    sseSeenIds.current = new Set();
  }, [slug]);

  useEffect(() => {
    // Always keep SSE open — chat sidebar is always visible
    let es: EventSource | null = null;

    const connect = async () => {
      const token = await getToken();
      void token;
      es = new EventSource(
        `${window.location.origin}${basePath}/api/projects/${slug}/messages/stream`,
      );

      es.onmessage = (evt) => {
        try {
          const payload = JSON.parse(evt.data) as { type: string; message?: Message; presence?: Presence };
          if (payload.type === "message" && payload.message) {
            const incoming = payload.message;
            if (!sseSeenIds.current.has(incoming.id)) {
              sseSeenIds.current.add(incoming.id);
              setSseMessages((prev) => [...prev, incoming]);
              setNewMessageIds((ids) => new Set([...ids, incoming.id]));
            }
          } else if (payload.type === "presence" && payload.presence) {
            const incoming = payload.presence;
            qc.setQueryData<Presence[]>(getListPresenceQueryKey(), (old = []) => {
              const others = old.filter((p) => p.userId !== incoming.userId);
              return [...others, incoming];
            });
          }
        } catch { /* ignore malformed */ }
      };

      es.onerror = () => {
        // auto-reconnects handled by EventSource
      };
    };

    void connect();
    return () => { es?.close(); };
  }, [slug, getToken]);

  // Merge query messages + SSE messages, dedup by id
  const allMessages = useMemo<Message[]>(() => {
    const base = (messagesData as Message[]);
    const existing = new Set(base.map((m) => m.id));
    return [...base, ...sseMessages.filter((m) => !existing.has(m.id))];
  }, [messagesData, sseMessages]);

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [allMessages]);

  const items: RichItem[] = itemsData.map((i) => ({ ...i, projectSlug: slug! }));

  useEffect(() => {
    if (!isDraggingDocRef.current) {
      const sorted = [...(docs as Doc[])].sort((a, b) => {
        if (a.pinned !== b.pinned) return b.pinned ? 1 : -1;
        return a.order !== b.order ? a.order - b.order : a.title.localeCompare(b.title);
      });
      setLocalDocs(sorted);
    }
  }, [docs]);

  type DocWithSnippet = Doc & { snippet?: string };

  const { data: serverSearchResults, isFetching: searchFetching } = useQuery<DocWithSnippet[]>({
    queryKey: ["docs-search", slug, debouncedDocSearch],
    queryFn: async ({ signal }) => {
      const url = `${basePath}/api/projects/${slug}/docs?q=${encodeURIComponent(debouncedDocSearch)}`;
      const resp = await fetch(url, { credentials: "include", signal });
      if (!resp.ok) throw new Error("Search failed");
      return resp.json() as Promise<DocWithSnippet[]>;
    },
    enabled: !!debouncedDocSearch && !!slug,
    staleTime: 10_000,
  });

  const docSearchFiltered = useMemo<DocWithSnippet[]>(() => {
    if (debouncedDocSearch) return serverSearchResults ?? [];
    return localDocs as DocWithSnippet[];
  }, [debouncedDocSearch, serverSearchResults, localDocs]);

  // Presence heartbeat: send PUT /api/presence while the chat tab is open
  useEffect(() => {
    if (activeTab !== "chat") return;

    const heartbeat = async () => {
      try {
        await fetch(`${window.location.origin}${basePath}/api/presence`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        });
      } catch { /* ignore network errors */ }
    };

    void heartbeat();
    const id = setInterval(() => void heartbeat(), 30_000);
    return () => clearInterval(id);
  }, [slug, activeTab]);

  const handleSendMsg = async () => {
    const text = chatMsg.trim();
    if (!text) return;
    setChatMsg(""); // clear input immediately for snappy UX
    try {
      const created = await postMessage.mutateAsync({ slug, data: { body: text } });
      // Immediately show the sender's own message with teletype effect
      if (!sseSeenIds.current.has(created.id)) {
        sseSeenIds.current.add(created.id);
        setSseMessages((prev) => [...prev, created]);
        setNewMessageIds((ids) => new Set([...ids, created.id]));
      }
      // Also invalidate so non-SSE state stays consistent
      qc.invalidateQueries({ queryKey: getListMessagesQueryKey(slug!) });
    } catch {
      setChatMsg(text); // restore draft so the user can retry
      toast({ title: "Failed to send message", variant: "destructive" });
    }
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

  const handleDeleteDoc = (doc: Doc) => {
    setDocToDelete(doc);
  };

  const confirmDeleteDoc = async () => {
    if (!docToDelete) return;
    try {
      await deleteDoc.mutateAsync({ slug: slug!, docSlug: docToDelete.slug });
      qc.invalidateQueries({ queryKey: getListDocsQueryKey(slug!) });
      toast({ title: "Doc deleted" });
    } catch {
      toast({ title: "Failed to delete doc", variant: "destructive" });
    } finally {
      setDocToDelete(null);
    }
  };

  const handleTogglePin = async (doc: Doc) => {
    await updateDoc.mutateAsync({ slug: slug!, docSlug: doc.slug, data: { pinned: !doc.pinned } });
    qc.invalidateQueries({ queryKey: getListDocsQueryKey(slug!) });
  };

  const handleDocDrop = async (targetSlug: string) => {
    if (!draggedDocSlug || draggedDocSlug === targetSlug) return;
    const draggedDoc = localDocs.find((d) => d.slug === draggedDocSlug);
    const targetDoc = localDocs.find((d) => d.slug === targetSlug);
    if (!draggedDoc || !targetDoc || draggedDoc.pinned !== targetDoc.pinned) return;

    const group = localDocs.filter((d) => d.pinned === draggedDoc.pinned);
    const otherGroup = localDocs.filter((d) => d.pinned !== draggedDoc.pinned);
    const fromIdx = group.findIndex((d) => d.slug === draggedDocSlug);
    const toIdx = group.findIndex((d) => d.slug === targetSlug);
    if (fromIdx === toIdx) return;

    const newGroup = [...group];
    const [moved] = newGroup.splice(fromIdx, 1);
    newGroup.splice(toIdx, 0, moved);
    const reindexed = newGroup.map((d, i) => ({ ...d, order: i }));

    const newLocalDocs = draggedDoc.pinned
      ? [...reindexed, ...otherGroup]
      : [...otherGroup, ...reindexed];
    setLocalDocs(newLocalDocs);

    const patches = reindexed.filter((d) => {
      const orig = group.find((g) => g.slug === d.slug);
      return orig?.order !== d.order;
    });
    try {
      await Promise.all(
        patches.map((d) =>
          updateDoc.mutateAsync({ slug: slug!, docSlug: d.slug, data: { order: d.order } })
        )
      );
      qc.invalidateQueries({ queryKey: getListDocsQueryKey(slug!) });
    } catch {
      toast({ title: "Failed to save doc order", variant: "destructive" });
      await qc.invalidateQueries({ queryKey: getListDocsQueryKey(slug!) });
    }
  };

  const handleSaveGithubRepo = async () => {
    const val = githubRepoInput.trim() || null;
    try {
      await updateProject.mutateAsync({ slug: slug!, data: { githubRepo: val } });
      qc.invalidateQueries({ queryKey: getGetProjectQueryKey(slug!) });
      qc.invalidateQueries({ queryKey: getListCommitsQueryKey(slug!) });
      toast({ title: val ? "GitHub repo linked" : "GitHub repo removed" });
    } catch {
      toast({ title: "Failed to save GitHub repo", variant: "destructive" });
    }
  };

  const handleSaveGithubToken = async () => {
    const val = githubTokenInput.trim() || null;
    try {
      await updateProject.mutateAsync({ slug: slug!, data: { githubToken: val } });
      setGithubTokenInput("");
      toast({ title: val ? "GitHub token saved" : "GitHub token removed" });
    } catch {
      toast({ title: "Failed to save GitHub token", variant: "destructive" });
    }
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

  const handleLogTime = async () => {
    const mins = parseInt(newTimeEntry.minutes, 10);
    if (!newTimeEntry.itemNumber) {
      toast({ title: "Please select an item", variant: "destructive" });
      return;
    }
    if (!mins || isNaN(mins) || mins <= 0) {
      toast({ title: "Please enter a valid number of minutes", variant: "destructive" });
      return;
    }
    const itemNum = parseInt(newTimeEntry.itemNumber, 10);
    // Use local date to avoid UTC day skew near midnight
    const now = new Date();
    const spentOn = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    try {
      await createTimeEntry.mutateAsync({
        slug: slug!,
        itemNumber: itemNum,
        data: {
          minutes: mins,
          billable: newTimeEntry.billable,
          note: newTimeEntry.note || undefined,
          spentOn,
        },
      });
      qc.invalidateQueries({ queryKey: getListProjectTimeEntriesQueryKey(slug!) });
      setLogTimeOpen(false);
      setNewTimeEntry({ itemNumber: "", minutes: "", note: "", billable: true });
      toast({ title: "Time logged" });
    } catch {
      toast({ title: "Failed to log time", variant: "destructive" });
    }
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
    <Layout title={project.name.toUpperCase()} fluid>
      <div className="flex flex-1 h-full min-h-0">
        <div className="flex-1 overflow-auto p-4 min-w-0 space-y-4">
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
              { value: "docs", label: "DOCS" },
              { value: "activity", label: "ACTIVITY" },
              { value: "standup", label: "STANDUP" },
              { value: "members", label: "MEMBERS" },
              { value: "budget", label: "BUDGET" },
              { value: "stats", label: "STATS" },
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
            {!docSearch.trim() && (
              <p className="text-[10px] font-mono text-muted-foreground/60">
                drag rows to reorder within each group
              </p>
            )}
            {docSearch.trim() && debouncedDocSearch !== docSearch.trim() || searchFetching ? (
              <p className="text-[10px] font-mono text-muted-foreground/60 py-1">searching…</p>
            ) : null}
            {!searchFetching && docSearchFiltered.length === 0 ? (
              <div className="border border-border bg-card p-6 text-center text-muted-foreground font-mono text-sm">
                {docSearch.trim() ? `no docs matching "${docSearch.trim()}"` : "no docs yet — create one above"}
              </div>
            ) : (
              <div className="border border-border divide-y divide-border">
                {docSearchFiltered.map((doc) => {
                  const isBeingDragged = draggedDocSlug === doc.slug;
                  const isDragTarget = dragOverDocSlug === doc.slug && draggedDocSlug !== doc.slug;
                  const canDrag = !docSearch.trim();
                  return (
                    <div
                      key={doc.id}
                      draggable={canDrag}
                      onDragStart={() => {
                        isDraggingDocRef.current = true;
                        setDraggedDocSlug(doc.slug);
                      }}
                      onDragEnd={() => {
                        isDraggingDocRef.current = false;
                        setDraggedDocSlug(null);
                        setDragOverDocSlug(null);
                      }}
                      onDragOver={(e) => { e.preventDefault(); setDragOverDocSlug(doc.slug); }}
                      onDragLeave={(e) => {
                        if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                          setDragOverDocSlug(null);
                        }
                      }}
                      onDrop={() => { void handleDocDrop(doc.slug); setDragOverDocSlug(null); }}
                      className={cn(
                        "flex flex-col gap-1 px-3 py-2.5 bg-card hover:bg-muted/20 transition-colors",
                        isBeingDragged && "opacity-40",
                        isDragTarget && "border-l-2 border-l-primary bg-primary/5",
                      )}
                    >
                      <div className="flex items-center gap-2">
                      <div
                        className={cn(
                          "shrink-0 text-muted-foreground/40 transition-colors",
                          canDrag ? "cursor-grab hover:text-muted-foreground" : "invisible",
                        )}
                      >
                        <GripVertical className="h-3.5 w-3.5" />
                      </div>
                      <FileText className="h-3.5 w-3.5 text-primary shrink-0" />
                      <button
                        className="flex-1 text-left font-mono text-sm text-foreground truncate hover:text-primary transition-colors min-w-0"
                        onClick={() => { setEditDoc(doc); setDocForm({ title: doc.title, body: doc.body }); setDocOpen(true); }}
                      >
                        {doc.title}
                      </button>
                      {doc.pinned && (
                        <span className="text-[10px] font-mono text-accent border border-accent/50 px-1 shrink-0">PINNED</span>
                      )}
                      <span className="text-[10px] text-muted-foreground font-mono shrink-0 hidden sm:block">
                        {doc.updatedAt ? new Date(doc.updatedAt).toLocaleDateString() : "—"}
                      </span>
                      <div className="flex items-center gap-0.5 shrink-0" onClick={(e) => e.stopPropagation()}>
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
                      {doc.snippet && (
                        <p
                          className="text-[11px] font-mono text-muted-foreground pl-10 leading-relaxed [&_mark]:bg-primary/20 [&_mark]:text-primary [&_mark]:rounded-sm [&_mark]:px-0.5"
                          dangerouslySetInnerHTML={{ __html: doc.snippet }}
                        />
                      )}
                    </div>
                  );
                })}
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

          {/* STATS TAB — burn-down chart, hours, commits, cost summary */}
          <TabsContent value="stats" className="mt-3 space-y-6">
            {/* Cost / Budget summary card */}
            <div className="border border-border bg-card p-4 space-y-3">
              <span className="font-mono text-xs tracking-widest text-primary">// BUDGET VS SPEND</span>
              {burnDown ? (
                <>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="space-y-1">
                      <div className="font-mono text-[10px] tracking-widest text-muted-foreground">TOTAL BUDGET</div>
                      <div className="font-mono text-lg text-foreground">
                        ${((burnDown as { totalBudgetCents: number }).totalBudgetCents / 100).toFixed(2)}
                      </div>
                    </div>
                    <div className="space-y-1">
                      <div className="font-mono text-[10px] tracking-widest text-muted-foreground">TOTAL SPENT</div>
                      <div className="font-mono text-lg text-accent">
                        ${((burnDown as { totalSpentCents: number }).totalSpentCents / 100).toFixed(2)}
                      </div>
                    </div>
                    <div className="space-y-1">
                      <div className="font-mono text-[10px] tracking-widest text-muted-foreground">REMAINING</div>
                      <div className={cn("font-mono text-lg", ((burnDown as { totalBudgetCents: number; totalSpentCents: number }).totalBudgetCents - (burnDown as { totalSpentCents: number }).totalSpentCents) < 0 ? "text-destructive" : "text-primary")}>
                        ${(((burnDown as { totalBudgetCents: number }).totalBudgetCents - (burnDown as { totalSpentCents: number }).totalSpentCents) / 100).toFixed(2)}
                      </div>
                    </div>
                    <div className="space-y-1">
                      <div className="font-mono text-[10px] tracking-widest text-muted-foreground">BURN RATE</div>
                      <div className="font-mono text-lg text-foreground">
                        {(burnDown as { totalBudgetCents: number }).totalBudgetCents > 0
                          ? `${Math.round(((burnDown as { totalSpentCents: number }).totalSpentCents / (burnDown as { totalBudgetCents: number }).totalBudgetCents) * 100)}%`
                          : "—"}
                      </div>
                    </div>
                  </div>
                  {/* Per-scope breakdown */}
                  {(burnDown as { scopes: Array<{ scopeId: number; scopeName: string; budgetCents: number; spentCents: number }> }).scopes.length > 0 && (
                    <div className="space-y-2 pt-2 border-t border-border">
                      <div className="font-mono text-[10px] tracking-widest text-muted-foreground">BY SCOPE</div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        {(burnDown as { scopes: Array<{ scopeId: number; scopeName: string; budgetCents: number; spentCents: number }> }).scopes.map((s) => (
                          <div key={s.scopeId} className="border border-border p-2 space-y-1">
                            <div className="flex justify-between font-mono text-xs">
                              <span className="text-foreground truncate">{s.scopeName}</span>
                              <span className="text-muted-foreground shrink-0 ml-2">
                                ${(s.spentCents / 100).toFixed(2)} / ${(s.budgetCents / 100).toFixed(2)}
                              </span>
                            </div>
                            <div className="w-full bg-muted h-1">
                              <div
                                className={cn("h-1", s.budgetCents > 0 && s.spentCents > s.budgetCents ? "bg-destructive" : "bg-accent")}
                                style={{ width: `${Math.min(100, s.budgetCents > 0 ? (s.spentCents / s.budgetCents) * 100 : 0)}%` }}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="text-muted-foreground font-mono text-sm">no budget data — add scopes with budgets</div>
              )}
            </div>

            {/* Burn-down line chart — open items over time */}
            {items.length > 0 && (() => {
              const msPerDay = 86_400_000;
              const endMs = Date.now();
              const sorted = [...items].sort(
                (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
              );
              const projectStartMs = new Date(sorted[0]!.createdAt).getTime();
              const projectDays = Math.ceil((endMs - projectStartMs) / msPerDay) + 1;
              const cappedAt90 = projectDays > 90;
              const totalDays = Math.min(90, projectDays);
              const startMs = cappedAt90 ? endMs - 90 * msPerDay : projectStartMs;
              const chartData = Array.from({ length: totalDays }, (_, i) => {
                const dayMs = startMs + i * msPerDay;
                const dateStr = new Date(dayMs).toISOString().slice(0, 10);
                const open = items.filter((it) => {
                  const created = new Date(it.createdAt).getTime();
                  const closed = it.closedAt ? new Date(it.closedAt).getTime() : null;
                  return created <= dayMs && (closed === null || closed > dayMs);
                }).length;
                return { date: dateStr, open };
              });
              return (
                <div className="border border-border bg-card p-4 space-y-3">
                  <span className="font-mono text-xs tracking-widest text-primary">// BURN-DOWN — OPEN ITEMS OVER TIME</span>
                  <ResponsiveContainer width="100%" height={220}>
                    <LineChart data={chartData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="2 4" stroke="hsl(var(--border))" />
                      <XAxis
                        dataKey="date"
                        tick={{ fontFamily: "monospace", fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                        tickFormatter={(v: string) => v.slice(5)}
                        stroke="hsl(var(--border))"
                        interval={Math.max(1, Math.floor(totalDays / 8)) - 1}
                      />
                      <YAxis
                        tick={{ fontFamily: "monospace", fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                        allowDecimals={false}
                        stroke="hsl(var(--border))"
                        width={40}
                      />
                      <Tooltip
                        contentStyle={{
                          background: "hsl(var(--card))",
                          border: "1px solid hsl(var(--border))",
                          fontFamily: "monospace",
                          fontSize: 11,
                          color: "hsl(var(--foreground))",
                        }}
                        formatter={(value: number) => [value, "OPEN ITEMS"]}
                        labelFormatter={(label: string) => `DATE: ${label}`}
                      />
                      <Line type="monotone" dataKey="open" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} name="open" />
                    </LineChart>
                  </ResponsiveContainer>
                  <div className="flex gap-4 font-mono text-[10px] text-muted-foreground">
                    <span className="flex items-center gap-1"><span className="inline-block w-4 h-0.5 bg-primary" /> OPEN ITEMS</span>
                    {cappedAt90 && <span>(last 90 days)</span>}
                  </div>
                </div>
              );
            })()}

            {/* Hours logged */}
            <div className="border border-border bg-card p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs tracking-widest text-primary">// HOURS LOGGED</span>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setLogTimeOpen(true)}
                  className="text-xs font-mono border border-primary/50 text-primary hover:bg-primary/10 gap-1 h-7 px-2"
                >
                  <Plus className="h-3 w-3" /> LOG TIME
                </Button>
              </div>
              {(timeEntries as TimeEntry[]).length === 0 ? (
                <div className="text-muted-foreground font-mono text-sm">no time entries yet</div>
              ) : (() => {
                const te = timeEntries as TimeEntry[];
                const totalMins = te.reduce((sum, t) => sum + t.minutes, 0);
                const billableMins = te.filter((t) => t.billable).reduce((sum, t) => sum + t.minutes, 0);
                const byUser = te.reduce<Record<string, number>>((acc, t) => {
                  const name = (t.user as { displayName?: string } | undefined)?.displayName ?? t.userId;
                  acc[name] = (acc[name] ?? 0) + t.minutes;
                  return acc;
                }, {});

                // Build itemId → scopeId/estimateMinutes map from items
                const itemScopeMap = new Map<number, { scopeId: number | null; milestoneId: number | null; estimateMinutes: number | null }>();
                items.forEach((it) => {
                  itemScopeMap.set(it.id, {
                    scopeId: (it as { scopeId?: number | null }).scopeId ?? null,
                    milestoneId: (it as { milestoneId?: number | null }).milestoneId ?? null,
                    estimateMinutes: (it as { estimateMinutes?: number | null }).estimateMinutes ?? null,
                  });
                });

                // Per-scope: sum estimate minutes from items, sum logged minutes from time entries
                const scopes = project.scopes as Scope[];
                const scopeStats = scopes.map((s) => {
                  const scopeItems = items.filter((it) => (it as { scopeId?: number | null }).scopeId === s.id);
                  const estimateMins = scopeItems.reduce((sum, it) => sum + ((it as { estimateMinutes?: number | null }).estimateMinutes ?? 0), 0);
                  const loggedMins = te.filter((t) => {
                    const info = t.itemId != null ? itemScopeMap.get(t.itemId) : null;
                    return info?.scopeId === s.id;
                  }).reduce((sum, t) => sum + t.minutes, 0);
                  return { name: s.name, estimateMins, loggedMins, itemCount: scopeItems.length };
                }).filter((s) => s.itemCount > 0 || s.loggedMins > 0);

                return (
                  <div className="space-y-4">
                    {/* Summary metrics */}
                    <div className="grid grid-cols-3 gap-3">
                      <div className="space-y-1">
                        <div className="font-mono text-[10px] tracking-widest text-muted-foreground">TOTAL LOGGED</div>
                        <div className="font-mono text-lg text-foreground">{(totalMins / 60).toFixed(1)}h</div>
                      </div>
                      <div className="space-y-1">
                        <div className="font-mono text-[10px] tracking-widest text-muted-foreground">BILLABLE</div>
                        <div className="font-mono text-lg text-accent">{(billableMins / 60).toFixed(1)}h</div>
                      </div>
                      <div className="space-y-1">
                        <div className="font-mono text-[10px] tracking-widest text-muted-foreground">ENTRIES</div>
                        <div className="font-mono text-lg text-foreground">{te.length}</div>
                      </div>
                    </div>

                    {/* Logged vs estimate per scope */}
                    {scopeStats.length > 0 && (
                      <div className="space-y-1 border-t border-border pt-3">
                        <div className="font-mono text-[10px] tracking-widest text-muted-foreground">LOGGED VS ESTIMATE BY SCOPE</div>
                        <div className="divide-y divide-border border border-border">
                          {scopeStats.map((s) => {
                            const pct = s.estimateMins > 0 ? Math.min(200, Math.round((s.loggedMins / s.estimateMins) * 100)) : null;
                            const over = pct !== null && pct > 100;
                            return (
                              <div key={s.name} className="px-3 py-2 space-y-1">
                                <div className="flex justify-between font-mono text-xs">
                                  <span className="text-foreground truncate">{s.name}</span>
                                  <span className={cn("shrink-0 ml-4", over ? "text-destructive" : "text-muted-foreground")}>
                                    {(s.loggedMins / 60).toFixed(1)}h logged
                                    {s.estimateMins > 0 && ` / ${(s.estimateMins / 60).toFixed(1)}h est`}
                                    {pct !== null && ` (${pct}%)`}
                                  </span>
                                </div>
                                {s.estimateMins > 0 && (
                                  <div className="w-full bg-muted h-1">
                                    <div
                                      className={cn("h-1", over ? "bg-destructive" : "bg-primary")}
                                      style={{ width: `${Math.min(100, (s.loggedMins / s.estimateMins) * 100)}%` }}
                                    />
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* By member */}
                    {Object.keys(byUser).length > 0 && (
                      <div className="space-y-1 border-t border-border pt-3">
                        <div className="font-mono text-[10px] tracking-widest text-muted-foreground">BY MEMBER</div>
                        <div className="divide-y divide-border border border-border">
                          {Object.entries(byUser).sort((a, b) => b[1] - a[1]).map(([name, mins]) => (
                            <div key={name} className="flex justify-between px-3 py-1.5 font-mono text-xs">
                              <span className="text-foreground truncate">{name}</span>
                              <span className="text-muted-foreground shrink-0 ml-4">{(mins / 60).toFixed(1)}h</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>

            {/* GitHub commits */}
            {project.githubRepo ? (
              <div className="border border-border bg-card p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs tracking-widest text-primary">// GITHUB COMMITS</span>
                  <a
                    href={`https://github.com/${project.githubRepo}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-mono text-[10px] text-muted-foreground hover:text-primary transition-colors"
                  >
                    {project.githubRepo} ↗
                  </a>
                </div>
                {(commits as Commit[]).length === 0 ? (
                  <div className="text-muted-foreground font-mono text-sm">no commits recorded yet</div>
                ) : (
                  <div className="divide-y divide-border border border-border max-h-80 overflow-y-auto">
                    {(commits as Commit[]).map((c) => (
                      <div key={c.id} className="flex items-start gap-3 px-3 py-2 font-mono text-xs hover:bg-muted/20 transition-colors">
                        <span className="text-muted-foreground shrink-0 font-bold">{c.sha.slice(0, 7)}</span>
                        <div className="flex-1 min-w-0 space-y-0.5">
                          <div className="text-foreground truncate">{c.message.split("\n")[0]}</div>
                          <div className="text-muted-foreground">
                            {c.authorName ?? c.authorGithub ?? "unknown"} · {new Date(c.committedAt).toLocaleDateString()}
                          </div>
                        </div>
                        {c.url && (
                          <a
                            href={c.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary hover:text-primary/70 shrink-0 transition-colors"
                          >
                            ↗
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="border border-border bg-card p-4 space-y-1">
                <span className="font-mono text-xs tracking-widest text-primary">// GITHUB COMMITS</span>
                <p className="font-mono text-sm text-muted-foreground pt-1">
                  no GitHub repo linked — set <code className="text-accent">githubRepo</code> in project settings to enable commit tracking
                </p>
              </div>
            )}
          </TabsContent>

          {/* SETTINGS TAB */}
          <TabsContent value="settings" className="mt-3">
            <div className="max-w-lg space-y-4">
              {/* GitHub Repo */}
              <div className="border border-border bg-card p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-primary shrink-0" />
                  <div className="font-mono text-sm text-foreground">GitHub Repository</div>
                </div>
                <div className="text-xs text-muted-foreground font-mono">
                  Link a GitHub repo to show commit activity on the Stats tab. Use <code className="text-accent">owner/repo</code> format.
                </div>
                <div className="flex gap-2">
                  <Input
                    value={githubRepoInput}
                    onChange={(e) => setGithubRepoInput(e.target.value)}
                    className="bg-background border-border font-mono text-sm rounded-none flex-1"
                    placeholder="owner/repo"
                    onKeyDown={(e) => { if (e.key === "Enter") void handleSaveGithubRepo(); }}
                  />
                  <Button
                    size="sm"
                    onClick={() => void handleSaveGithubRepo()}
                    disabled={updateProject.isPending}
                    className="font-mono text-xs bg-primary text-primary-foreground hover:bg-primary/90 shrink-0"
                  >
                    {updateProject.isPending ? "SAVING..." : "SAVE"}
                  </Button>
                </div>
                {project.githubRepo && (
                  <div className="text-xs font-mono text-primary">
                    linked: {project.githubRepo}
                  </div>
                )}
              </div>

              {/* GitHub Token */}
              <div className="border border-border bg-card p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-primary shrink-0" />
                  <div className="font-mono text-sm text-foreground">GitHub Personal Access Token</div>
                </div>
                <div className="text-xs text-muted-foreground font-mono">
                  Required to poll private repositories. Enter a token with <code className="text-accent">repo</code> read scope. The token is stored securely and never shown again.
                </div>
                <div className="flex gap-2">
                  <Input
                    type="password"
                    value={githubTokenInput}
                    onChange={(e) => setGithubTokenInput(e.target.value)}
                    className="bg-background border-border font-mono text-sm rounded-none flex-1"
                    placeholder="ghp_…"
                    onKeyDown={(e) => { if (e.key === "Enter") void handleSaveGithubToken(); }}
                  />
                  <Button
                    size="sm"
                    onClick={() => void handleSaveGithubToken()}
                    disabled={updateProject.isPending}
                    className="font-mono text-xs bg-primary text-primary-foreground hover:bg-primary/90 shrink-0"
                  >
                    {updateProject.isPending ? "SAVING..." : "SAVE"}
                  </Button>
                </div>
                <div className="text-xs font-mono text-muted-foreground">
                  Leave blank and save to remove the stored token.
                </div>
              </div>

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
        </div>{/* end left column */}

        {/* ── Chat Sidebar ─────────────────────────────────────────── */}
        <aside className="w-72 border-l border-border flex flex-col shrink-0 overflow-hidden bg-card">
          {/* Header */}
          <div className="border-b border-border px-3 py-1.5 shrink-0 flex items-center gap-2">
            <span className="font-mono text-[10px] tracking-widest text-primary">// CHAT</span>
            <div className="ml-auto flex items-center gap-1.5 flex-wrap">
              {onlineUsers.length === 0 ? (
                <span className="font-mono text-[10px] text-muted-foreground">no one online</span>
              ) : (
                onlineUsers.map((p) => {
                  const name = p.user?.displayName ?? p.userId.slice(0, 8);
                  return (
                    <span key={p.userId} className="flex items-center gap-1 font-mono text-[10px] text-foreground">
                      <span className="h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
                      {name}
                    </span>
                  );
                })
              )}
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2 font-mono">
            {allMessages.length === 0 ? (
              <p className="text-muted-foreground text-[10px] leading-relaxed">
                no messages yet{"\n"}try /todo /bug /close /assign
              </p>
            ) : (
              allMessages.map((m) => {
                const isNew = newMessageIds.has(m.id);
                return (
                  <div
                    key={m.id}
                    className={cn("flex gap-1.5", m.authorId === "system" && "opacity-70")}
                  >
                    <span className={cn(
                      "shrink-0 text-[10px] mt-0.5",
                      m.authorId === "system" ? "text-accent" : "text-primary",
                    )}>
                      {m.authorId === "system" ? "sys" : ">"}
                    </span>
                    <div className="min-w-0">
                      {m.authorId !== "system" && (
                        <span className="text-[10px] text-accent mr-1.5">
                          {(m.author as { displayName?: string } | null)?.displayName ?? "USER"}
                        </span>
                      )}
                      <span className="text-foreground text-xs break-words">
                        {isNew ? (
                          <TeletypeText
                            text={m.body}
                            onDone={() => markRevealed(m.id)}
                          />
                        ) : (
                          m.body.split(/(@\w+|#\d+)/g).map((part, pi) =>
                            part.startsWith("@")
                              ? <span key={pi} className="text-accent font-bold">{part}</span>
                              : part.startsWith("#") && /^#\d+$/.test(part)
                                ? (
                                  <Link key={pi} href={`/projects/${slug}/items/${part.slice(1)}`}>
                                    <a className="text-primary font-bold hover:underline">{part}</a>
                                  </Link>
                                )
                                : part
                          )
                        )}
                      </span>
                      <span className="text-muted-foreground text-[10px] ml-1">
                        {new Date(m.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Input */}
          <div className="border-t border-border p-2 flex gap-2 shrink-0">
            <span className="text-primary font-mono text-sm self-center">$</span>
            <input
              value={chatMsg}
              onChange={(e) => setChatMsg(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && void handleSendMsg()}
              className="flex-1 bg-transparent font-mono text-xs text-foreground outline-none placeholder:text-muted-foreground"
              placeholder="message or /todo /bug..."
            />
            <button
              onClick={() => void handleSendMsg()}
              disabled={!chatMsg.trim() || postMessage.isPending}
              className="text-primary hover:text-primary/80 disabled:text-muted-foreground"
            >
              <Send className="h-3.5 w-3.5" />
            </button>
          </div>
        </aside>
      </div>{/* end outer flex */}

      {/* Log Time Dialog */}
      <Dialog open={logTimeOpen} onOpenChange={(open) => { setLogTimeOpen(open); if (!open) setNewTimeEntry({ itemNumber: "", minutes: "", note: "", billable: true }); }}>
        <DialogContent className="bg-card border-border max-w-md">
          <DialogHeader>
            <DialogTitle className="font-['VT323'] tracking-widest text-xl text-primary">
              // LOG TIME
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="font-mono text-xs tracking-widest text-muted-foreground">ITEM</Label>
              <Select
                value={newTimeEntry.itemNumber}
                onValueChange={(v) => setNewTimeEntry((p) => ({ ...p, itemNumber: v }))}
              >
                <SelectTrigger className="bg-background border-border font-mono text-xs h-8">
                  <SelectValue placeholder="select an item…" />
                </SelectTrigger>
                <SelectContent className="bg-card border-border font-mono text-xs max-h-60">
                  {items.map((it) => (
                    <SelectItem key={it.id} value={String(it.number)} className="font-mono text-xs">
                      #{it.number} {it.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="font-mono text-xs tracking-widest text-muted-foreground">MINUTES</Label>
              <Input
                type="number"
                min={1}
                value={newTimeEntry.minutes}
                onChange={(e) => setNewTimeEntry((p) => ({ ...p, minutes: e.target.value }))}
                className="bg-background border-border font-mono text-sm rounded-none"
                placeholder="e.g. 90"
                onKeyDown={(e) => { if (e.key === "Enter") void handleLogTime(); }}
              />
            </div>
            <div className="space-y-1">
              <Label className="font-mono text-xs tracking-widest text-muted-foreground">NOTE (OPTIONAL)</Label>
              <Input
                value={newTimeEntry.note}
                onChange={(e) => setNewTimeEntry((p) => ({ ...p, note: e.target.value }))}
                className="bg-background border-border font-mono text-sm rounded-none"
                placeholder="what did you work on?"
              />
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setNewTimeEntry((p) => ({ ...p, billable: !p.billable }))}
                className={cn(
                  "w-4 h-4 border flex items-center justify-center transition-colors shrink-0",
                  newTimeEntry.billable
                    ? "border-primary bg-primary/20 text-primary"
                    : "border-border text-muted-foreground",
                )}
              >
                {newTimeEntry.billable && <span className="text-[10px] font-mono">✓</span>}
              </button>
              <Label
                className="font-mono text-xs text-muted-foreground cursor-pointer"
                onClick={() => setNewTimeEntry((p) => ({ ...p, billable: !p.billable }))}
              >
                BILLABLE
              </Label>
            </div>
            <Button
              onClick={() => void handleLogTime()}
              disabled={createTimeEntry.isPending || !newTimeEntry.minutes || !newTimeEntry.itemNumber}
              className="w-full font-mono text-xs bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {createTimeEntry.isPending ? "LOGGING..." : "LOG TIME"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

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

      {/* Doc Create / Edit Dialog — full-screen editor with live preview */}
      <Dialog open={docOpen} onOpenChange={setDocOpen}>
        <DialogContent className="bg-card border-border w-[95vw] max-w-[95vw] h-[92vh] max-h-[92vh] flex flex-col p-0 gap-0">
          {/* Header bar */}
          <div className="flex items-center gap-3 px-4 py-2.5 border-b border-border shrink-0">
            <DialogTitle className="font-['VT323'] tracking-widest text-xl text-primary">
              {editDoc ? "// EDIT DOC" : "// NEW DOC"}
            </DialogTitle>
            <Input
              value={docForm.title}
              onChange={(e) => setDocForm((p) => ({ ...p, title: e.target.value }))}
              className="bg-background border-border font-mono text-sm rounded-none focus-visible:ring-primary h-8 flex-1 max-w-md"
              placeholder="doc title..."
              autoFocus={!editDoc}
            />
            <div className="flex gap-2 ml-auto">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setDocOpen(false)}
                className="font-mono text-xs text-muted-foreground h-8"
              >
                CANCEL
              </Button>
              <Button
                size="sm"
                onClick={() => void handleSaveDoc()}
                disabled={!docForm.title.trim() || createDoc.isPending || updateDoc.isPending}
                className="font-mono text-xs bg-primary text-primary-foreground hover:bg-primary/90 h-8"
              >
                {createDoc.isPending || updateDoc.isPending ? "SAVING…" : editDoc ? "SAVE" : "CREATE"}
              </Button>
            </div>
          </div>

          {/* Split editor + preview */}
          <div className="flex flex-1 min-h-0 divide-x divide-border">
            {/* Editor pane */}
            <div className="flex flex-col flex-1 min-w-0">
              <div className="px-3 py-1.5 border-b border-border shrink-0">
                <span className="font-mono text-[10px] tracking-widest text-muted-foreground">MARKDOWN</span>
              </div>
              <Textarea
                value={docForm.body}
                onChange={(e) => setDocForm((p) => ({ ...p, body: e.target.value }))}
                className="flex-1 resize-none bg-background border-0 font-mono text-sm rounded-none focus-visible:ring-0 focus-visible:ring-offset-0 p-4 h-full"
                placeholder="write in markdown..."
                autoFocus={!!editDoc}
              />
            </div>

            {/* Preview pane */}
            <div className="flex flex-col flex-1 min-w-0">
              <div className="px-3 py-1.5 border-b border-border shrink-0">
                <span className="font-mono text-[10px] tracking-widest text-muted-foreground">PREVIEW</span>
              </div>
              <div className="flex-1 overflow-y-auto p-4 prose prose-sm prose-invert max-w-none
                prose-headings:font-mono prose-headings:text-primary prose-headings:tracking-wider
                prose-a:text-primary prose-code:text-accent prose-pre:bg-background/80
                prose-strong:text-foreground prose-blockquote:border-primary/50 prose-blockquote:text-muted-foreground">
                {docForm.body.trim() ? (
                  <ReactMarkdown>{docForm.body}</ReactMarkdown>
                ) : (
                  <p className="text-muted-foreground italic text-sm font-mono">nothing to preview yet…</p>
                )}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      {/* Delete Doc Confirmation Dialog */}
      <Dialog open={!!docToDelete} onOpenChange={(open) => { if (!open) setDocToDelete(null); }}>
        <DialogContent className="bg-card border-border max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-['VT323'] tracking-widest text-xl text-destructive">
              // DELETE DOC
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="font-mono text-sm text-foreground">
              Are you sure you want to delete{" "}
              <span className="text-primary font-bold">"{docToDelete?.title}"</span>?
              This cannot be undone.
            </p>
            <div className="flex gap-2 justify-end">
              <Button
                variant="outline"
                className="font-mono text-xs border-border hover:bg-muted"
                onClick={() => setDocToDelete(null)}
              >
                CANCEL
              </Button>
              <Button
                className="font-mono text-xs bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={() => void confirmDeleteDoc()}
                disabled={deleteDoc.isPending}
              >
                {deleteDoc.isPending ? "DELETING..." : "DELETE"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
