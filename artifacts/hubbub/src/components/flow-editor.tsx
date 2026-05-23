import { useCallback, useRef, useState } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  addEdge,
  applyNodeChanges,
  applyEdgeChanges,
  ConnectionLineType,
  type Node,
  type Edge,
  type NodeChange,
  type EdgeChange,
  type Connection,
  Handle,
  MarkerType,
  Position,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { FlowData } from "@workspace/api-client-react";

// ── Shared handle style ──────────────────────────────────────────────────────

const FLOW_GREEN = "#00ff41";
const NODE_BG = "#050f05";
const SNAP: [number, number] = [20, 20];

const HANDLE_CLASS =
  "!border-[#020902] !border-2 !w-3 !h-3 !z-20";
const SOURCE_HANDLE_CLASS = `${HANDLE_CLASS} !bg-[#00ff41]`;
const TARGET_HANDLE_CLASS = `${HANDLE_CLASS} !bg-[#050f05] !border-[#00ff41]`;

const EDGE_OPTIONS = {
  type: "step",
  style: { stroke: FLOW_GREEN, strokeWidth: 1.75 },
  markerEnd: {
    type: MarkerType.ArrowClosed,
    color: FLOW_GREEN,
    width: 14,
    height: 14,
  },
  interactionWidth: 18,
  labelStyle: {
    fill: FLOW_GREEN,
    fontFamily: "Share Tech Mono, monospace",
    fontSize: 10,
    fontWeight: 700,
  },
  labelBgStyle: { fill: NODE_BG, fillOpacity: 0.95 },
  labelBgPadding: [6, 3] as [number, number],
} satisfies Partial<Edge>;

function edgeLabelForConnection(connection: Connection) {
  if (connection.sourceHandle === "yes") return "YES";
  if (connection.sourceHandle === "no") return "NO";
  return undefined;
}

function normalizeEdge(edge: Edge): Edge {
  return {
    ...EDGE_OPTIONS,
    ...edge,
    style: { ...EDGE_OPTIONS.style, ...edge.style },
    markerEnd: edge.markerEnd ?? EDGE_OPTIONS.markerEnd,
  };
}

const SIDE_HANDLES = [
  { id: "top", position: Position.Top },
  { id: "right", position: Position.Right },
  { id: "bottom", position: Position.Bottom },
  { id: "left", position: Position.Left },
] as const;

function handleStyle(side: string, type: "source" | "target"): React.CSSProperties {
  const offset = type === "target" ? "42%" : "58%";
  if (side === "top" || side === "bottom") return { left: offset };
  return { top: offset };
}

function AllSideHandles({ omitSources = [] }: { omitSources?: string[] }) {
  return (
    <>
      {SIDE_HANDLES.map((side) => (
        <Handle
          key={`target-${side.id}`}
          id={`target-${side.id}`}
          type="target"
          position={side.position}
          className={TARGET_HANDLE_CLASS}
          style={handleStyle(side.id, "target")}
        />
      ))}
      {SIDE_HANDLES.filter((side) => !omitSources.includes(side.id)).map((side) => (
        <Handle
          key={`source-${side.id}`}
          id={`source-${side.id}`}
          type="source"
          position={side.position}
          className={SOURCE_HANDLE_CLASS}
          style={handleStyle(side.id, "source")}
        />
      ))}
    </>
  );
}

// ── Custom node types ───────────────────────────────────────────────────────

function NodeShell({
  children,
  selected,
  className,
  style,
}: {
  children: React.ReactNode;
  selected: boolean;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div
      style={style}
      className={cn(
        "relative flex h-[72px] w-[180px] items-center justify-center px-4 py-3",
        "font-mono text-[11px] uppercase tracking-[0.08em] border bg-[#050f05] transition-colors select-none shadow-[0_0_12px_rgba(0,255,65,0.08)]",
        selected ? "border-[#00ff41] text-[#00ff41]" : "border-[#00ff41]/50 text-[#00ff41]/80",
        className,
      )}
    >
      <AllSideHandles />
      {children}
    </div>
  );
}

function ProcessNode({ data, selected }: NodeProps) {
  return (
    <NodeShell selected={selected ?? false}>
      <span className="text-center break-words leading-tight">{String(data.label)}</span>
    </NodeShell>
  );
}

function TerminalNode({ data, selected }: NodeProps) {
  return (
    <NodeShell selected={selected ?? false} className="rounded-full px-6">
      <span className="text-center break-words leading-tight">{String(data.label)}</span>
    </NodeShell>
  );
}

function DecisionNode({ data, selected }: NodeProps) {
  const W = 190;
  const HT = 96;
  const stroke = selected ? "#00ff41" : "rgba(0,255,65,0.5)";
  const textColor = selected ? "#00ff41" : "rgba(0,255,65,0.8)";
  const pts = `${W / 2},2 ${W - 2},${HT / 2} ${W / 2},${HT - 2} 2,${HT / 2}`;

  return (
    <div style={{ width: W, height: HT, position: "relative" }}>
      <Handle type="target" position={Position.Top} id="target-top" className={TARGET_HANDLE_CLASS} style={{ top: 0, left: "42%" }} />
      <Handle type="source" position={Position.Top} id="source-top" className={SOURCE_HANDLE_CLASS} style={{ top: 0, left: "58%" }} />
      <Handle type="target" position={Position.Left} id="target-left" className={TARGET_HANDLE_CLASS} style={{ top: "42%", left: 0 }} />
      <Handle type="source" position={Position.Left} id="source-left" className={SOURCE_HANDLE_CLASS} style={{ top: "58%", left: 0 }} />
      <Handle type="target" position={Position.Right} id="target-right" className={TARGET_HANDLE_CLASS} style={{ top: "42%", right: 0 }} />
      <Handle type="source" position={Position.Right} id="source-right" className={SOURCE_HANDLE_CLASS} style={{ top: "58%", right: 0 }} />
      <Handle type="target" position={Position.Bottom} id="target-bottom" className={TARGET_HANDLE_CLASS} style={{ bottom: 0, left: "50%" }} />

      <svg
        width={W}
        height={HT}
        style={{ position: "absolute", inset: 0, overflow: "visible" }}
      >
        <polygon points={pts} fill={NODE_BG} stroke={stroke} strokeWidth={1.25} />
      </svg>

      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "0 42px",
          pointerEvents: "none",
        }}
      >
        <span
          style={{
            fontFamily: "monospace",
            fontSize: 11,
            color: textColor,
            textAlign: "center",
            wordBreak: "break-word",
            lineHeight: 1.3,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
          }}
        >
          {String(data.label)}
        </span>
      </div>

      <Handle type="source" position={Position.Bottom} id="yes" className={SOURCE_HANDLE_CLASS} style={{ bottom: 0, left: "34%" }} />
      <Handle type="source" position={Position.Bottom} id="no" className={SOURCE_HANDLE_CLASS} style={{ bottom: 0, left: "66%" }} />
      <span className="pointer-events-none absolute bottom-2 left-[30%] -translate-x-1/2 font-mono text-[9px] font-bold text-[#00ff41]/65">
        YES
      </span>
      <span className="pointer-events-none absolute bottom-2 left-[70%] -translate-x-1/2 font-mono text-[9px] font-bold text-[#00ff41]/65">
        NO
      </span>
    </div>
  );
}

function DbNode({ data, selected }: NodeProps) {
  return (
    <div className="relative flex h-[82px] w-[180px] flex-col items-center justify-center">
      <AllSideHandles />
      <div
        className={cn(
          "relative flex h-full w-full flex-col justify-center overflow-hidden rounded-[50%/16%] border bg-[#050f05] font-mono text-[11px] uppercase tracking-[0.08em] shadow-[0_0_12px_rgba(0,255,65,0.08)]",
          selected ? "border-[#00ff41] text-[#00ff41]" : "border-[#00ff41]/50 text-[#00ff41]/80",
        )}
      >
        <div className={cn("absolute inset-x-0 top-0 h-4 rounded-[50%] border-b", selected ? "border-[#00ff41]" : "border-[#00ff41]/50")} />
        <span className="px-4 text-center leading-tight break-words">{String(data.label)}</span>
      </div>
    </div>
  );
}

function QueryNode({ data, selected }: NodeProps) {
  return (
    <NodeShell selected={selected ?? false} className="border-accent/50 text-accent/80">
      <span className="absolute top-1 left-2 font-mono text-[8px] tracking-widest text-accent/60">
        SQL QUERY
      </span>
      <span className="text-center break-words leading-tight">{String(data.label)}</span>
    </NodeShell>
  );
}

function DataIoNode({ data, selected, tag }: NodeProps & { tag: string }) {
  return (
    <div className="relative h-[72px] w-[180px]">
      <AllSideHandles />
      <div
        className={cn(
          "flex h-full w-full -skew-x-12 items-center justify-center border bg-[#050f05] px-5 py-3 font-mono text-[11px] uppercase tracking-[0.08em] shadow-[0_0_12px_rgba(0,255,65,0.08)]",
          selected ? "border-[#00ff41] text-[#00ff41]" : "border-[#00ff41]/50 text-[#00ff41]/80",
        )}
      >
        <span className="absolute left-3 top-1 skew-x-12 text-[8px] tracking-widest text-[#00ff41]/45">
          {tag}
        </span>
        <span className="skew-x-12 text-center leading-tight break-words">{String(data.label)}</span>
      </div>
    </div>
  );
}

function InputNode(props: NodeProps) {
  return <DataIoNode {...props} tag="INPUT" />;
}

function OutputNode(props: NodeProps) {
  return <DataIoNode {...props} tag="OUTPUT" />;
}

function IoNode(props: NodeProps) {
  return <DataIoNode {...props} tag="I/O" />;
}

const NODE_TYPES = {
  process: ProcessNode,
  terminal: TerminalNode,
  decision: DecisionNode,
  input: InputNode,
  output: OutputNode,
  query: QueryNode,
  db: DbNode,
  io: IoNode,
};

// ── Palette ─────────────────────────────────────────────────────────────────

const PALETTE: { type: string; label: string; display: string; description: string }[] = [
  { type: "terminal",  label: "Start / End",     display: "( START )",      description: "Terminal point"   },
  { type: "process",   label: "Process",          display: "[ PROCESS ]",    description: "Step / action"    },
  { type: "decision",  label: "Decision",         display: "◇ BRANCH",       description: "Yes / No branch"  },
  { type: "input",     label: "Input",            display: "/ INPUT /",      description: "Incoming data"    },
  { type: "output",    label: "Output",           display: "/ OUTPUT /",     description: "Returned data"    },
  { type: "query",     label: "Query",            display: "[ SQL QUERY ]",  description: "DB read / write"  },
  { type: "db",        label: "Database",         display: "( DATA STORE )", description: "Database store"   },
];

type FlowTemplate = {
  label: string;
  description: string;
  nodes: Node[];
  edges: Edge[];
};

const FLOW_TEMPLATES: FlowTemplate[] = [
  {
    label: "DEPLOYMENT",
    description: "Build, test, approve, release",
    nodes: [
      { id: "start", type: "terminal", position: { x: 80, y: 40 }, data: { label: "Commit" } },
      { id: "build", type: "process", position: { x: 80, y: 160 }, data: { label: "Build Artifact" } },
      { id: "test", type: "process", position: { x: 80, y: 280 }, data: { label: "Run CI Tests" } },
      { id: "gate", type: "decision", position: { x: 70, y: 400 }, data: { label: "Release Approved?" } },
      { id: "deploy", type: "process", position: { x: 80, y: 540 }, data: { label: "Deploy to Prod" } },
      { id: "rollback", type: "process", position: { x: 320, y: 540 }, data: { label: "Fix / Rollback" } },
    ],
    edges: [
      { id: "e-start-build", source: "start", target: "build" },
      { id: "e-build-test", source: "build", target: "test" },
      { id: "e-test-gate", source: "test", target: "gate" },
      { id: "e-gate-deploy", source: "gate", sourceHandle: "yes", target: "deploy", label: "YES" },
      { id: "e-gate-rollback", source: "gate", sourceHandle: "no", target: "rollback", label: "NO" },
    ],
  },
  {
    label: "SERVICE MAP",
    description: "Client, API, DB, async worker",
    nodes: [
      { id: "client", type: "input", position: { x: 80, y: 80 }, data: { label: "Client App" } },
      { id: "api", type: "process", position: { x: 80, y: 220 }, data: { label: "API Service" } },
      { id: "query", type: "query", position: { x: 80, y: 360 }, data: { label: "Read / Write Data" } },
      { id: "db", type: "db", position: { x: 80, y: 500 }, data: { label: "Postgres" } },
      { id: "queue", type: "process", position: { x: 320, y: 220 }, data: { label: "Queue Worker" } },
      { id: "third-party", type: "output", position: { x: 320, y: 360 }, data: { label: "External API" } },
    ],
    edges: [
      { id: "e-client-api", source: "client", target: "api", label: "HTTPS" },
      { id: "e-api-query", source: "api", target: "query", label: "CALLS" },
      { id: "e-query-db", source: "query", target: "db", label: "READ/WRITE" },
      { id: "e-api-queue", source: "api", target: "queue", label: "ENQUEUE" },
      { id: "e-queue-external", source: "queue", target: "third-party", label: "SYNC" },
    ],
  },
  {
    label: "INCIDENT",
    description: "Detect, triage, mitigate",
    nodes: [
      { id: "alert", type: "terminal", position: { x: 80, y: 60 }, data: { label: "Alert Fires" } },
      { id: "triage", type: "process", position: { x: 80, y: 180 }, data: { label: "Triage Impact" } },
      { id: "sev", type: "decision", position: { x: 70, y: 300 }, data: { label: "Customer Impact?" } },
      { id: "mitigate", type: "process", position: { x: 80, y: 440 }, data: { label: "Mitigate / Patch" } },
      { id: "monitor", type: "process", position: { x: 320, y: 440 }, data: { label: "Monitor Only" } },
      { id: "postmortem", type: "terminal", position: { x: 80, y: 560 }, data: { label: "Postmortem" } },
    ],
    edges: [
      { id: "e-alert-triage", source: "alert", target: "triage" },
      { id: "e-triage-sev", source: "triage", target: "sev" },
      { id: "e-sev-mitigate", source: "sev", sourceHandle: "yes", target: "mitigate", label: "YES" },
      { id: "e-sev-monitor", source: "sev", sourceHandle: "no", target: "monitor", label: "NO" },
      { id: "e-mitigate-postmortem", source: "mitigate", target: "postmortem" },
    ],
  },
];

let idCounter = 1;
function nextId() { return `n${idCounter++}`; }

// ── Main editor ─────────────────────────────────────────────────────────────

interface FlowEditorProps {
  initialData: FlowData;
  onSave: (data: FlowData) => Promise<void>;
  saving?: boolean;
}

export function FlowEditor({ initialData, onSave, saving }: FlowEditorProps) {
  const [nodes, setNodes] = useState<Node[]>(initialData.nodes as Node[]);
  const [edges, setEdges] = useState<Edge[]>(() =>
    (initialData.edges as Edge[]).map(normalizeEdge),
  );
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [labelInput, setLabelInput] = useState("");
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const [rfInstance, setRfInstance] = useState<Parameters<NonNullable<React.ComponentProps<typeof ReactFlow>["onInit"]>>[0] | null>(null);

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => setNodes((nds) => applyNodeChanges(changes, nds)),
    [],
  );
  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => setEdges((eds) => applyEdgeChanges(changes, eds)),
    [],
  );
  const onConnect = useCallback(
    (connection: Connection) =>
      setEdges((eds) =>
        addEdge(
          {
            ...EDGE_OPTIONS,
            ...connection,
            label: edgeLabelForConnection(connection),
            animated: false,
          },
          eds,
        ),
      ),
    [],
  );

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    setSelectedNode(node);
    setLabelInput(String(node.data.label ?? ""));
  }, []);

  const onPaneClick = useCallback(() => {
    setSelectedNode(null);
    setLabelInput("");
  }, []);

  const handleLabelSave = () => {
    if (!selectedNode) return;
    setNodes((nds) =>
      nds.map((n) =>
        n.id === selectedNode.id ? { ...n, data: { ...n.data, label: labelInput } } : n,
      ),
    );
    setSelectedNode((prev) =>
      prev ? { ...prev, data: { ...prev.data, label: labelInput } } : null,
    );
  };

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      if (!rfInstance) return;
      const type = e.dataTransfer.getData("application/reactflow-type");
      const label = e.dataTransfer.getData("application/reactflow-label");
      if (!type) return;
      // screenToFlowPosition takes raw screen (viewport) coords
      const position = rfInstance.screenToFlowPosition({ x: e.clientX, y: e.clientY });
      // Snap to grid
      position.x = Math.round(position.x / SNAP[0]) * SNAP[0];
      position.y = Math.round(position.y / SNAP[1]) * SNAP[1];
      setNodes((nds) => [...nds, { id: nextId(), type, position, data: { label } }]);
    },
    [rfInstance],
  );

  const applyTemplate = useCallback((template: FlowTemplate) => {
    const prefix = `tpl-${Date.now()}`;
    const offset = nodes.length > 0 ? 120 : 0;
    setNodes((nds) => [
      ...nds,
      ...template.nodes.map((node) => ({
        ...node,
        id: `${prefix}-${node.id}`,
        position: { x: node.position.x + offset, y: node.position.y + offset },
      })),
    ]);
    setEdges((eds) => [
      ...eds,
      ...template.edges.map((edge) =>
        normalizeEdge({
          ...edge,
          id: `${prefix}-${edge.id}`,
          source: `${prefix}-${edge.source}`,
          target: `${prefix}-${edge.target}`,
        }),
      ),
    ]);
  }, [nodes.length]);

  const handleDeleteSelected = useCallback(() => {
    if (!selectedNode) return;
    setNodes((nds) => nds.filter((n) => n.id !== selectedNode.id));
    setEdges((eds) =>
      eds.filter((e) => e.source !== selectedNode.id && e.target !== selectedNode.id),
    );
    setSelectedNode(null);
  }, [selectedNode]);

  return (
    <div className="flex h-full min-h-0">
      {/* Left palette */}
      <div className="w-44 shrink-0 border-r border-[#00ff41]/20 bg-[#050f05] flex flex-col gap-1 p-2 overflow-y-auto">
        <p className="font-mono text-[9px] tracking-widest text-[#00ff41]/50 mb-1 px-1">
          // DRAG TO CANVAS
        </p>
        <div className="mb-2 space-y-1 border-b border-[#00ff41]/20 pb-2">
          <p className="font-mono text-[9px] tracking-widest text-[#00ff41]/50 px-1">
            // TEMPLATES
          </p>
          {FLOW_TEMPLATES.map((template) => (
            <button
              key={template.label}
              type="button"
              onClick={() => applyTemplate(template)}
              className="w-full border border-[#00ff41]/25 bg-[#00ff41]/5 p-2 text-left font-mono transition-colors hover:border-[#00ff41]/70 hover:bg-[#00ff41]/10"
            >
              <span className="block text-[10px] font-bold text-[#00ff41]">{template.label}</span>
              <span className="block text-[9px] leading-tight text-[#00ff41]/50">{template.description}</span>
            </button>
          ))}
        </div>
        {PALETTE.map((item) => (
          <div
            key={item.type}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData("application/reactflow-type", item.type);
              e.dataTransfer.setData("application/reactflow-label", item.label);
              e.dataTransfer.effectAllowed = "move";
            }}
            className="cursor-grab active:cursor-grabbing border border-[#00ff41]/30 hover:border-[#00ff41] bg-[#050f05] hover:bg-[#00ff41]/5 p-2 transition-colors"
          >
            <p className="font-mono text-[10px] text-[#00ff41] whitespace-pre-line leading-tight">
              {item.display}
            </p>
            <p className="font-mono text-[9px] text-[#00ff41]/50 mt-0.5">{item.description}</p>
          </div>
        ))}

        {/* Selected node panel */}
        {selectedNode && (
          <div className="mt-3 border-t border-[#00ff41]/20 pt-3 flex flex-col gap-2">
            <p className="font-mono text-[9px] tracking-widest text-[#00ff41]/50">
              // SELECTED NODE
            </p>
            <Input
              value={labelInput}
              onChange={(e) => setLabelInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleLabelSave();
              }}
              className="h-7 bg-[#050f05] border-[#00ff41]/50 focus-visible:border-[#00ff41] font-mono text-xs text-[#00ff41] rounded-none focus-visible:ring-0 focus-visible:ring-offset-0"
              placeholder="label..."
            />
            <Button
              size="sm"
              onClick={handleLabelSave}
              className="h-7 font-mono text-[10px] rounded-none bg-[#00ff41]/10 border border-[#00ff41]/50 text-[#00ff41] hover:bg-[#00ff41]/20"
            >
              RENAME
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={handleDeleteSelected}
              className="h-7 font-mono text-[10px] rounded-none border border-red-900/50 text-red-400 hover:bg-red-900/20 hover:text-red-300"
            >
              DELETE
            </Button>
          </div>
        )}

        <div className="mt-auto pt-3 border-t border-[#00ff41]/20">
          <Button
            size="sm"
            onClick={() => void onSave({ nodes: nodes as FlowData["nodes"], edges: edges as FlowData["edges"] })}
            disabled={saving}
            className="w-full h-8 font-mono text-xs rounded-none bg-[#00ff41] text-[#050f05] hover:bg-[#00ff41]/90 font-bold"
          >
            {saving ? "SAVING…" : "SAVE"}
          </Button>
        </div>
      </div>

      {/* Canvas */}
      <div
        ref={reactFlowWrapper}
        className="flex-1 min-w-0 bg-[#020902]"
        onDragOver={onDragOver}
        onDrop={onDrop}
      >
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={NODE_TYPES}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeClick={onNodeClick}
          onPaneClick={onPaneClick}
          onInit={setRfInstance}
          fitView
          snapToGrid
          snapGrid={SNAP}
          deleteKeyCode={["Delete", "Backspace"]}
          connectionLineType={ConnectionLineType.Step}
          defaultEdgeOptions={EDGE_OPTIONS}
          style={{ background: "#020902" }}
        >
          <Background color="#00ff41" gap={SNAP[0]} size={0.5} style={{ opacity: 0.08 }} />
          <Controls
            style={{
              background: "#050f05",
              border: "1px solid rgba(0,255,65,0.3)",
              borderRadius: 0,
            }}
          />
          <MiniMap
            style={{ background: "#050f05", border: "1px solid rgba(0,255,65,0.2)" }}
            nodeColor="#00ff41"
            maskColor="rgba(2,9,2,0.7)"
          />
        </ReactFlow>
      </div>
    </div>
  );
}
