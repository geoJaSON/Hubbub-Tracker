import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetTestPlan,
  useImportTestPlan,
  useCreateTestSuite,
  useUpdateTestSuite,
  useDeleteTestSuite,
  useCreateTestCase,
  useUpdateTestCase,
  useDeleteTestCase,
  useCreateTestRun,
  useDeleteTestRun,
  getGetTestPlanQueryKey,
  type TestSuite,
  type TestCase,
  type TestRun,
  type TestRunResult,
  type TestCaseStatus,
} from "@workspace/api-client-react";
import { MOBILE_TEST_PLAN } from "@/lib/test-plan-seed";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  Plus, Trash2, Pencil, ChevronDown, ChevronRight, AlertTriangle,
  CheckCircle2, XCircle, MinusCircle, Ban, Circle, MoreVertical,
  Smartphone, Download,
} from "lucide-react";

// ── Status / result presentation ─────────────────────────────────────────────
const RESULT_META: Record<
  TestCaseStatus,
  { label: string; icon: typeof Circle; cls: string; dot: string }
> = {
  pass:     { label: "PASS",     icon: CheckCircle2, cls: "text-primary border-primary/50 bg-primary/10", dot: "bg-primary" },
  fail:     { label: "FAIL",     icon: XCircle,      cls: "text-destructive border-destructive/50 bg-destructive/10", dot: "bg-destructive" },
  skip:     { label: "SKIP",     icon: MinusCircle,  cls: "text-muted-foreground border-border", dot: "bg-muted-foreground" },
  blocked:  { label: "BLOCKED",  icon: Ban,          cls: "text-accent border-accent/50 bg-accent/10", dot: "bg-accent" },
  untested: { label: "UNTESTED", icon: Circle,       cls: "text-muted-foreground border-border/60", dot: "bg-border" },
};

const RUN_RESULTS: TestRunResult[] = ["pass", "fail", "skip", "blocked"];

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function StatusBadge({ status }: { status: TestCaseStatus }) {
  const m = RESULT_META[status];
  const Icon = m.icon;
  return (
    <span className={cn("inline-flex items-center gap-1 border px-1.5 py-0.5 text-[10px] font-mono tracking-wider", m.cls)}>
      <Icon className="h-3 w-3" />
      {m.label}
    </span>
  );
}

interface TestingTabProps {
  slug: string;
}

export function TestingTab({ slug }: TestingTabProps) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data, isLoading } = useGetTestPlan(slug);

  const suites = data?.suites ?? [];

  // Shared mutation behavior: refresh the plan on success, surface errors as toasts.
  const mutation = {
    onSuccess: () => qc.invalidateQueries({ queryKey: getGetTestPlanQueryKey(slug) }),
    onError: (err: unknown) =>
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : "Request failed",
        variant: "destructive",
      }),
  };

  // ── Mutations (generated typed hooks) ─────────────────────────────────────────
  const importMut = useImportTestPlan({ mutation });
  const createSuiteMut = useCreateTestSuite({ mutation });
  const updateSuiteMut = useUpdateTestSuite({ mutation });
  const deleteSuiteMut = useDeleteTestSuite({ mutation });
  const createCaseMut = useCreateTestCase({ mutation });
  const updateCaseMut = useUpdateTestCase({ mutation });
  const deleteCaseMut = useDeleteTestCase({ mutation });
  const createRunMut = useCreateTestRun({ mutation });
  const deleteRunMut = useDeleteTestRun({ mutation });

  // ── UI state ─────────────────────────────────────────────────────────────────
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());
  const [expandedCases, setExpandedCases] = useState<Set<number>>(new Set());
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<TestCaseStatus | "all">("all");
  const [ownerFilter, setOwnerFilter] = useState<string>("all");

  // Dialogs
  const [suiteDialog, setSuiteDialog] = useState<{ mode: "create" | "edit"; suite?: TestSuite } | null>(null);
  const [caseDialog, setCaseDialog] = useState<{ mode: "create" | "edit"; suiteId: number; testCase?: TestCase } | null>(null);
  const [runDialog, setRunDialog] = useState<{ testCase: TestCase } | null>(null);

  const owners = useMemo(() => {
    const s = new Set<string>();
    for (const su of suites) for (const c of su.cases) if (c.owner) s.add(c.owner);
    return [...s].sort();
  }, [suites]);

  const matchesFilters = (c: TestCase): boolean => {
    if (statusFilter !== "all" && c.currentStatus !== statusFilter) return false;
    if (ownerFilter !== "all" && c.owner !== ownerFilter) return false;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      const hay = `${c.code ?? ""} ${c.title} ${c.expected ?? ""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  };

  // Progress across all cases (ignores filters)
  const allCases = suites.flatMap((s) => s.cases);
  const total = allCases.length;
  const tested = allCases.filter((c) => c.currentStatus !== "untested").length;
  const passed = allCases.filter((c) => c.currentStatus === "pass").length;
  const failed = allCases.filter((c) => c.currentStatus === "fail").length;
  const pct = total ? Math.round((tested / total) * 100) : 0;

  const toggle = (set: React.Dispatch<React.SetStateAction<Set<number>>>, id: number) =>
    set((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const handleImport = () => {
    importMut.mutate(
      { slug, data: MOBILE_TEST_PLAN },
      {
        onSuccess: (r) => {
          toast({ title: "Imported", description: `${r.suites} suites · ${r.cases} cases added.` });
        },
      },
    );
  };

  if (isLoading) {
    return (
      <div className="border border-border bg-card p-8 text-center">
        <p className="text-muted-foreground font-mono text-sm animate-pulse">LOADING TEST PLAN…</p>
      </div>
    );
  }

  // ── Empty state ────────────────────────────────────────────────────────────
  if (suites.length === 0) {
    return (
      <>
        <div className="border border-border bg-card p-10 text-center space-y-4">
          <Smartphone className="h-8 w-8 text-primary mx-auto" />
          <div>
            <p className="text-foreground font-mono text-sm tracking-wider">NO TEST PLAN YET</p>
            <p className="text-muted-foreground font-mono text-xs mt-1">
              Start from the Field App checklist, or build your own from scratch.
            </p>
          </div>
          <div className="flex items-center justify-center gap-2">
            <Button
              size="sm"
              onClick={handleImport}
              disabled={importMut.isPending}
              className="font-mono text-xs gap-1"
            >
              <Download className="h-3 w-3" />
              {importMut.isPending ? "IMPORTING…" : `IMPORT FIELD APP PLAN (${MOBILE_TEST_PLAN.suites.length} suites)`}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setSuiteDialog({ mode: "create" })}
              className="font-mono text-xs border border-border gap-1"
            >
              <Plus className="h-3 w-3" /> NEW SUITE
            </Button>
          </div>
        </div>
        {suiteDialog && (
          <SuiteDialog
            dialog={suiteDialog}
            onClose={() => setSuiteDialog(null)}
            onCreate={(input) => createSuiteMut.mutate({ slug, data: input }, { onSuccess: () => setSuiteDialog(null) })}
            onUpdate={(id, input) => updateSuiteMut.mutate({ slug, suiteId: id, data: input }, { onSuccess: () => setSuiteDialog(null) })}
            pending={createSuiteMut.isPending || updateSuiteMut.isPending}
          />
        )}
      </>
    );
  }

  return (
    <div className="space-y-3">
      {/* Progress + controls */}
      <div className="border border-border bg-card p-3 space-y-3">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex-1 min-w-[200px]">
            <div className="flex items-center justify-between text-[11px] font-mono text-muted-foreground mb-1">
              <span>{tested} / {total} TESTED</span>
              <span>
                <span className="text-primary">{passed} pass</span>
                {failed > 0 && <span className="text-destructive"> · {failed} fail</span>}
              </span>
            </div>
            <div className="h-1.5 bg-muted overflow-hidden">
              <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
            </div>
          </div>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setSuiteDialog({ mode: "create" })}
            className="font-mono text-xs border border-primary/50 text-primary hover:bg-primary/10 gap-1"
          >
            <Plus className="h-3 w-3" /> NEW SUITE
          </Button>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter scenarios…"
            className="h-7 text-xs font-mono w-48"
          />
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as TestCaseStatus | "all")}>
            <SelectTrigger className="h-7 text-xs font-mono w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="untested">Untested</SelectItem>
              <SelectItem value="pass">Pass</SelectItem>
              <SelectItem value="fail">Fail</SelectItem>
              <SelectItem value="skip">Skip</SelectItem>
              <SelectItem value="blocked">Blocked</SelectItem>
            </SelectContent>
          </Select>
          {owners.length > 0 && (
            <Select value={ownerFilter} onValueChange={setOwnerFilter}>
              <SelectTrigger className="h-7 text-xs font-mono w-32"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All owners</SelectItem>
                {owners.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setCollapsed(collapsed.size ? new Set() : new Set(suites.map((s) => s.id)))}
            className="font-mono text-[11px] text-muted-foreground hover:text-foreground ml-auto"
          >
            {collapsed.size ? "EXPAND ALL" : "COLLAPSE ALL"}
          </Button>
        </div>
      </div>

      {/* Suites */}
      {suites.map((suite) => {
        const visibleCases = suite.cases.filter(matchesFilters);
        if (search.trim() || statusFilter !== "all" || ownerFilter !== "all") {
          if (visibleCases.length === 0) return null;
        }
        const isCollapsed = collapsed.has(suite.id);
        const suiteTested = suite.cases.filter((c) => c.currentStatus !== "untested").length;
        return (
          <div key={suite.id} className="border border-border">
            {/* Suite header */}
            <div
              className={cn(
                "flex items-center gap-2 px-3 py-2 bg-card cursor-pointer select-none hover:bg-muted/50",
                suite.warn && "border-l-2 border-l-destructive",
              )}
              onClick={() => toggle(setCollapsed, suite.id)}
            >
              {isCollapsed ? <ChevronRight className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
              <h3 className="font-mono text-sm text-foreground flex-1 flex items-center gap-2">
                {suite.code && <span className="text-primary">{suite.code}.</span>}
                {suite.title}
                {suite.warn && <AlertTriangle className="h-3.5 w-3.5 text-destructive" />}
              </h3>
              <span className="text-[11px] font-mono text-muted-foreground">{suiteTested}/{suite.cases.length}</span>
              <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                <button
                  title="Add case"
                  onClick={() => setCaseDialog({ mode: "create", suiteId: suite.id })}
                  className="text-muted-foreground hover:text-primary p-1"
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button className="text-muted-foreground hover:text-foreground p-1"><MoreVertical className="h-3.5 w-3.5" /></button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="font-mono text-xs">
                    <DropdownMenuItem onClick={() => setSuiteDialog({ mode: "edit", suite })}>
                      <Pencil className="h-3 w-3 mr-2" /> Edit suite
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      onClick={() => {
                        if (confirm(`Delete suite "${suite.title}" and its ${suite.cases.length} case(s)? This cannot be undone.`)) {
                          deleteSuiteMut.mutate({ slug, suiteId: suite.id });
                        }
                      }}
                    >
                      <Trash2 className="h-3 w-3 mr-2" /> Delete suite
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>

            {/* Cases */}
            {!isCollapsed && (
              <div className="divide-y divide-border border-t border-border">
                {visibleCases.length === 0 && (
                  <p className="px-3 py-3 text-xs font-mono text-muted-foreground">No cases yet.</p>
                )}
                {visibleCases.map((c) => (
                  <CaseRow
                    key={c.id}
                    testCase={c}
                    expanded={expandedCases.has(c.id)}
                    onToggle={() => toggle(setExpandedCases, c.id)}
                    onLogRun={() => setRunDialog({ testCase: c })}
                    onEdit={() => setCaseDialog({ mode: "edit", suiteId: suite.id, testCase: c })}
                    onDelete={() => {
                      if (confirm(`Delete case "${c.code ?? c.title}" and its ${c.runs.length} run(s)?`)) {
                        deleteCaseMut.mutate({ slug, caseId: c.id });
                      }
                    }}
                    onDeleteRun={(runId) => deleteRunMut.mutate({ slug, runId })}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}

      {/* Dialogs */}
      {suiteDialog && (
        <SuiteDialog
          dialog={suiteDialog}
          onClose={() => setSuiteDialog(null)}
          onCreate={(input) => createSuiteMut.mutate({ slug, data: input }, { onSuccess: () => setSuiteDialog(null) })}
          onUpdate={(id, input) => updateSuiteMut.mutate({ slug, suiteId: id, data: input }, { onSuccess: () => setSuiteDialog(null) })}
          pending={createSuiteMut.isPending || updateSuiteMut.isPending}
        />
      )}
      {caseDialog && (
        <CaseDialog
          dialog={caseDialog}
          onClose={() => setCaseDialog(null)}
          onCreate={(suiteId, input) => createCaseMut.mutate({ slug, suiteId, data: input }, { onSuccess: () => setCaseDialog(null) })}
          onUpdate={(id, input) => updateCaseMut.mutate({ slug, caseId: id, data: input }, { onSuccess: () => setCaseDialog(null) })}
          pending={createCaseMut.isPending || updateCaseMut.isPending}
        />
      )}
      {runDialog && (
        <RunDialog
          testCase={runDialog.testCase}
          onClose={() => setRunDialog(null)}
          onSubmit={(input) => createRunMut.mutate({ slug, caseId: runDialog.testCase.id, data: input }, { onSuccess: () => setRunDialog(null) })}
          pending={createRunMut.isPending}
        />
      )}
    </div>
  );
}

// ── Case row ───────────────────────────────────────────────────────────────────
function CaseRow({
  testCase: c,
  expanded,
  onToggle,
  onLogRun,
  onEdit,
  onDelete,
  onDeleteRun,
}: {
  testCase: TestCase;
  expanded: boolean;
  onToggle: () => void;
  onLogRun: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onDeleteRun: (runId: number) => void;
}) {
  return (
    <div className="bg-background">
      <div className="flex items-start gap-2 px-3 py-2">
        <button onClick={onToggle} className="mt-0.5 text-muted-foreground hover:text-foreground">
          {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            {c.code && <span className="text-[11px] font-mono text-muted-foreground">{c.code}</span>}
            <span className="text-xs text-foreground">{c.title}</span>
            {c.owner && (
              <span className="text-[10px] font-mono border border-border text-muted-foreground px-1 rounded-sm">{c.owner}</span>
            )}
          </div>
          {c.expected && (
            <p className="text-[11px] text-muted-foreground mt-0.5 font-mono">→ {c.expected}</p>
          )}
          {/* Tracking line */}
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <StatusBadge status={c.currentStatus} />
            <span className="text-[10px] font-mono text-muted-foreground">
              last tested {fmtDate(c.lastTestedAt)}
            </span>
            {c.devices.length > 0 && (
              <span className="text-[10px] font-mono text-muted-foreground inline-flex items-center gap-1">
                <Smartphone className="h-3 w-3" />
                {c.devices.join(", ")}
              </span>
            )}
            {c.runs.length > 0 && (
              <span className="text-[10px] font-mono text-muted-foreground/70">· {c.runs.length} run{c.runs.length === 1 ? "" : "s"}</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Button size="sm" variant="ghost" onClick={onLogRun} className="h-6 px-2 font-mono text-[10px] border border-primary/40 text-primary hover:bg-primary/10 gap-1">
            <Plus className="h-3 w-3" /> RUN
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="text-muted-foreground hover:text-foreground p-1"><MoreVertical className="h-3.5 w-3.5" /></button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="font-mono text-xs">
              <DropdownMenuItem onClick={onEdit}><Pencil className="h-3 w-3 mr-2" /> Edit case</DropdownMenuItem>
              <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={onDelete}>
                <Trash2 className="h-3 w-3 mr-2" /> Delete case
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Run history */}
      {expanded && (
        <div className="px-3 pb-3 pl-8">
          {c.runs.length === 0 ? (
            <p className="text-[11px] font-mono text-muted-foreground">No runs logged yet.</p>
          ) : (
            <div className="border border-border divide-y divide-border">
              {c.runs.map((r) => <RunRow key={r.id} run={r} onDelete={() => onDeleteRun(r.id)} />)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function RunRow({ run, onDelete }: { run: TestRun; onDelete: () => void }) {
  return (
    <div className="flex items-start gap-2 px-2 py-1.5 bg-card/50">
      <StatusBadge status={run.result} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 text-[10px] font-mono text-muted-foreground">
          {run.device && <span className="inline-flex items-center gap-1 text-foreground"><Smartphone className="h-3 w-3" />{run.device}</span>}
          <span>{fmtDate(run.testedAt)}</span>
        </div>
        {run.note && <p className="text-[11px] text-muted-foreground mt-0.5">{run.note}</p>}
      </div>
      <button onClick={onDelete} title="Delete run" className="text-muted-foreground hover:text-destructive p-0.5">
        <Trash2 className="h-3 w-3" />
      </button>
    </div>
  );
}

// ── Suite create/edit dialog ─────────────────────────────────────────────────
function SuiteDialog({
  dialog,
  onClose,
  onCreate,
  onUpdate,
  pending,
}: {
  dialog: { mode: "create" | "edit"; suite?: TestSuite };
  onClose: () => void;
  onCreate: (input: { title: string; code?: string; warn?: boolean }) => void;
  onUpdate: (id: number, input: { title?: string; code?: string; warn?: boolean }) => void;
  pending: boolean;
}) {
  const editing = dialog.mode === "edit" && dialog.suite;
  const [title, setTitle] = useState(dialog.suite?.title ?? "");
  const [code, setCode] = useState(dialog.suite?.code ?? "");
  const [warn, setWarn] = useState(dialog.suite?.warn ?? false);

  const submit = () => {
    if (!title.trim()) return;
    const input = { title: title.trim(), code: code.trim() || undefined, warn };
    if (editing && dialog.suite) onUpdate(dialog.suite.id, input);
    else onCreate(input);
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="font-mono">
        <DialogHeader><DialogTitle>{editing ? "EDIT SUITE" : "NEW SUITE"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="flex gap-2">
            <div className="w-20">
              <Label className="text-xs">Code</Label>
              <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="A" className="mt-1 text-sm" />
            </div>
            <div className="flex-1">
              <Label className="text-xs">Title</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Auth & session" className="mt-1 text-sm" autoFocus />
            </div>
          </div>
          <label className="flex items-center gap-2 text-xs cursor-pointer">
            <input type="checkbox" checked={warn} onChange={(e) => setWarn(e.target.checked)} />
            Flag as a high-risk area (⚠️)
          </label>
        </div>
        <div className="flex justify-end gap-2 mt-2">
          <Button size="sm" variant="ghost" onClick={onClose} className="font-mono text-xs">CANCEL</Button>
          <Button size="sm" onClick={submit} disabled={pending || !title.trim()} className="font-mono text-xs">
            {pending ? "SAVING…" : "SAVE"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Case create/edit dialog ──────────────────────────────────────────────────
function CaseDialog({
  dialog,
  onClose,
  onCreate,
  onUpdate,
  pending,
}: {
  dialog: { mode: "create" | "edit"; suiteId: number; testCase?: TestCase };
  onClose: () => void;
  onCreate: (suiteId: number, input: { title: string; code?: string; expected?: string; owner?: string }) => void;
  onUpdate: (id: number, input: { title?: string; code?: string; expected?: string; owner?: string }) => void;
  pending: boolean;
}) {
  const editing = dialog.mode === "edit" && dialog.testCase;
  const [title, setTitle] = useState(dialog.testCase?.title ?? "");
  const [code, setCode] = useState(dialog.testCase?.code ?? "");
  const [expected, setExpected] = useState(dialog.testCase?.expected ?? "");
  const [owner, setOwner] = useState(dialog.testCase?.owner ?? "");

  const submit = () => {
    if (!title.trim()) return;
    const input = {
      title: title.trim(),
      code: code.trim() || undefined,
      expected: expected.trim() || undefined,
      owner: owner.trim() || undefined,
    };
    if (editing && dialog.testCase) onUpdate(dialog.testCase.id, input);
    else onCreate(dialog.suiteId, input);
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="font-mono">
        <DialogHeader><DialogTitle>{editing ? "EDIT CASE" : "NEW CASE"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="flex gap-2">
            <div className="w-24">
              <Label className="text-xs">Code</Label>
              <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="A1" className="mt-1 text-sm" />
            </div>
            <div className="flex-1">
              <Label className="text-xs">Owner</Label>
              <Input value={owner} onChange={(e) => setOwner(e.target.value)} placeholder="You / Me / Both" className="mt-1 text-sm" />
            </div>
          </div>
          <div>
            <Label className="text-xs">Scenario</Label>
            <Textarea value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What to test…" className="mt-1 text-sm" rows={2} autoFocus />
          </div>
          <div>
            <Label className="text-xs">Expected result</Label>
            <Textarea value={expected} onChange={(e) => setExpected(e.target.value)} placeholder="What should happen…" className="mt-1 text-sm" rows={2} />
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-2">
          <Button size="sm" variant="ghost" onClick={onClose} className="font-mono text-xs">CANCEL</Button>
          <Button size="sm" onClick={submit} disabled={pending || !title.trim()} className="font-mono text-xs">
            {pending ? "SAVING…" : "SAVE"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Log-a-run dialog ─────────────────────────────────────────────────────────
function todayInput(): string {
  // YYYY-MM-DD for <input type=date>; uses local date.
  const d = new Date();
  const tz = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - tz).toISOString().slice(0, 10);
}

function RunDialog({
  testCase: c,
  onClose,
  onSubmit,
  pending,
}: {
  testCase: TestCase;
  onClose: () => void;
  onSubmit: (input: { result: TestRunResult; device?: string; note?: string; testedAt?: string }) => void;
  pending: boolean;
}) {
  const [result, setResult] = useState<TestRunResult>("pass");
  const [device, setDevice] = useState("");
  const [note, setNote] = useState("");
  const [date, setDate] = useState(todayInput());

  const knownDevices = c.devices;

  const submit = () => {
    onSubmit({
      result,
      device: device.trim() || undefined,
      note: note.trim() || undefined,
      // Send as ISO; default to now if the date is today, else midnight local of chosen day.
      testedAt: date ? new Date(date).toISOString() : undefined,
    });
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="font-mono">
        <DialogHeader>
          <DialogTitle>LOG RUN — {c.code ?? c.title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="flex gap-2">
            <div className="flex-1">
              <Label className="text-xs">Result</Label>
              <Select value={result} onValueChange={(v) => setResult(v as TestRunResult)}>
                <SelectTrigger className="mt-1 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {RUN_RESULTS.map((r) => (
                    <SelectItem key={r} value={r}>{RESULT_META[r].label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1">
              <Label className="text-xs">Tested on</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="mt-1 text-sm" />
            </div>
          </div>
          <div>
            <Label className="text-xs">Device</Label>
            <Input
              value={device}
              onChange={(e) => setDevice(e.target.value)}
              placeholder="iPhone 14, Pixel 7…"
              className="mt-1 text-sm"
              list="known-devices"
            />
            {knownDevices.length > 0 && (
              <datalist id="known-devices">
                {knownDevices.map((d) => <option key={d} value={d} />)}
              </datalist>
            )}
          </div>
          <div>
            <Label className="text-xs">Note</Label>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="What happened…" className="mt-1 text-sm" rows={3} />
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-2">
          <Button size="sm" variant="ghost" onClick={onClose} className="font-mono text-xs">CANCEL</Button>
          <Button size="sm" onClick={submit} disabled={pending} className="font-mono text-xs">
            {pending ? "SAVING…" : "LOG RUN"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
