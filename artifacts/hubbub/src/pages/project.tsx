import { useState, useEffect, useRef, useMemo } from "react";
import { useParams, Link } from "wouter";
import { useAuth } from "@clerk/react";
import {
  useGetProject, useListItems, useListMessages, usePostMessage,
  useListActivity, useListDocs, useCreateItem, useUpdateItem,
  useGetStandup,
} from "@workspace/api-client-react";
import type {
  ItemInput, ItemInputType, ItemInputPriority,
  ItemUpdateStatus, Message,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getListItemsQueryKey, getListMessagesQueryKey, getListActivityQueryKey,
  getListDocsQueryKey, getGetProjectQueryKey,
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
  ArrowRight, FileText,
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

interface RichItem {
  id: number;
  number: number;
  type: string;
  title: string;
  status: string;
  priority: string;
  projectSlug: string;
  assignee?: { displayName: string } | null;
}

function ItemCard({
  item,
  onStatusChange,
}: {
  item: RichItem;
  onStatusChange: (id: number, status: ItemUpdateStatus) => void;
}) {
  const Icon = TYPE_ICONS[item.type] ?? CheckSquare;
  return (
    <div
      className={cn(
        "border bg-card p-3 space-y-2 hover:border-primary/40 transition-colors",
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

  const { data: project, isLoading: projLoading } = useGetProject({ slug });
  const { data: itemsData = [] } = useListItems({ slug });
  const { data: messagesData = [] } = useListMessages({ slug });
  const { data: activity = [] } = useListActivity({ slug });
  const { data: docs = [] } = useListDocs({ slug });
  const { data: standup } = useGetStandup();
  const postMessage = usePostMessage();
  const createItem = useCreateItem();
  const updateItem = useUpdateItem();

  const [chatMsg, setChatMsg] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [newItem, setNewItem] = useState<{
    type: ItemInputType;
    title: string;
    priority: ItemInputPriority;
    description: string;
  }>({ type: "todo", title: "", priority: "medium", description: "" });

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

  const items = (itemsData as RichItem[]).map((i) => ({ ...i, projectSlug: slug }));

  const handleSendMsg = async () => {
    if (!chatMsg.trim()) return;
    await postMessage.mutateAsync({ slug, data: { body: chatMsg } });
    // SSE will deliver the reply; also invalidate for non-SSE clients
    qc.invalidateQueries({ queryKey: getListMessagesQueryKey({ slug }) });
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
      qc.invalidateQueries({ queryKey: getListItemsQueryKey({ slug }) });
      setCreateOpen(false);
      setNewItem({ type: "todo", title: "", priority: "medium", description: "" });
      toast({ title: "Item created" });
    } catch {
      toast({ title: "Failed to create item", variant: "destructive" });
    }
  };

  const handleStatusChange = async (itemId: number, status: ItemUpdateStatus) => {
    const item = items.find((i) => i.id === itemId);
    if (!item) return;
    await updateItem.mutateAsync({ slug, itemNumber: item.number, data: { status } });
    qc.invalidateQueries({ queryKey: getListItemsQueryKey({ slug }) });
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
          <TabsContent value="items" className="mt-3">
            {items.length === 0 ? (
              <div className="border border-border bg-card p-8 text-center">
                <p className="text-muted-foreground font-mono text-sm">no items yet</p>
              </div>
            ) : (
              <div className="divide-y divide-border border border-border bg-card">
                {items.map((item) => (
                  <Link key={item.id} href={`/projects/${slug}/items/${item.number}`}>
                    <a className="flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors group">
                      {(() => {
                        const Icon = TYPE_ICONS[item.type] ?? CheckSquare;
                        return <Icon className={cn("h-3.5 w-3.5 shrink-0", PRIORITY_COLORS[item.priority])} />;
                      })()}
                      <span className="text-xs text-muted-foreground font-mono w-8">#{item.number}</span>
                      <span className="flex-1 font-mono text-sm text-foreground truncate">{item.title}</span>
                      <span className={cn("text-xs font-mono border px-1.5 py-0.5", STATUS_COLORS[item.status])}>
                        {STATUS_LABELS[item.status] ?? item.status}
                      </span>
                      <span className="text-xs text-muted-foreground font-mono hidden sm:block">{item.type}</span>
                      <ArrowRight className="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary transition-colors" />
                    </a>
                  </Link>
                ))}
              </div>
            )}
          </TabsContent>

          {/* BOARD TAB */}
          <TabsContent value="board" className="mt-3">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 overflow-x-auto">
              {STATUS_COLS.map((col) => {
                const colItems = items.filter((i) => i.status === col);
                return (
                  <div key={col} className="space-y-2 min-w-40">
                    <div className={cn("text-xs font-mono tracking-widest border-b pb-1", STATUS_COLORS[col])}>
                      {STATUS_LABELS[col]} ({colItems.length})
                    </div>
                    <div className="space-y-2">
                      {colItems.map((item) => (
                        <ItemCard key={item.id} item={item} onStatusChange={handleStatusChange} />
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
                        <span className="text-foreground">{m.body}</span>
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

          {/* DOCS TAB */}
          <TabsContent value="docs" className="mt-3">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {(docs as Array<{ id: number; title: string; pinned: boolean; body: string; updatedAt: string }>).length === 0 ? (
                <div className="col-span-3 border border-border bg-card p-6 text-center text-muted-foreground font-mono text-sm">
                  no docs yet
                </div>
              ) : (
                (docs as Array<{ id: number; title: string; pinned: boolean; body: string; updatedAt: string }>).map((doc) => (
                  <div key={doc.id} className="border border-border bg-card p-4 hover:border-primary/40 transition-colors">
                    <div className="flex items-center gap-2 mb-2">
                      <FileText className="h-3.5 w-3.5 text-primary shrink-0" />
                      <span className="font-mono text-sm text-foreground truncate">{doc.title}</span>
                      {doc.pinned && (
                        <span className="text-xs font-mono text-accent border border-accent/50 px-1">PINNED</span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground font-mono line-clamp-3">
                      {doc.body?.slice(0, 100)}
                    </p>
                    <p className="text-xs text-muted-foreground font-mono mt-2">
                      {new Date(doc.updatedAt).toLocaleDateString()}
                    </p>
                  </div>
                ))
              )}
            </div>
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
          <TabsContent value="standup" className="mt-3">
            <div className="border border-border bg-card p-4">
              {standup ? (
                <div className="prose prose-sm prose-invert font-mono max-w-none text-foreground [&_h2]:text-primary [&_h2]:font-['VT323'] [&_h2]:text-xl [&_strong]:text-accent">
                  <ReactMarkdown>{standup.content}</ReactMarkdown>
                </div>
              ) : (
                <p className="text-muted-foreground font-mono text-sm">loading standup...</p>
              )}
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
    </Layout>
  );
}
