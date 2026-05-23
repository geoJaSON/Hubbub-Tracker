import { useCallback, useRef, useState } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  addEdge,
  applyNodeChanges,
  applyEdgeChanges,
  type Node,
  type Edge,
  type NodeChange,
  type EdgeChange,
  type Connection,
  Handle,
  Position,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { FlowData } from "@workspace/api-client-react";

// ── Custom node types ───────────────────────────────────────────────────────

function NodeShell({
  children,
  selected,
  className,
}: {
  children: React.ReactNode;
  selected: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "min-w-[120px] max-w-[200px] flex items-center justify-center px-3 py-2",
        "font-mono text-xs border bg-[#050f05] transition-colors select-none",
        selected ? "border-[#00ff41] text-[#00ff41]" : "border-[#00ff41]/50 text-[#00ff41]/80",
        className,
      )}
    >
      {children}
    </div>
  );
}

function ProcessNode({ data, selected }: NodeProps) {
  return (
    <NodeShell selected={selected ?? false}>
      <Handle type="target" position={Position.Top} className="!bg-[#00ff41] !border-[#00ff41] !w-2 !h-2" />
      <span className="text-center break-words">{String(data.label)}</span>
      <Handle type="source" position={Position.Bottom} className="!bg-[#00ff41] !border-[#00ff41] !w-2 !h-2" />
    </NodeShell>
  );
}

function TerminalNode({ data, selected }: NodeProps) {
  return (
    <NodeShell selected={selected ?? false} className="rounded-full px-5">
      <Handle type="target" position={Position.Top} className="!bg-[#00ff41] !border-[#00ff41] !w-2 !h-2" />
      <span className="text-center break-words">{String(data.label)}</span>
      <Handle type="source" position={Position.Bottom} className="!bg-[#00ff41] !border-[#00ff41] !w-2 !h-2" />
    </NodeShell>
  );
}

function DecisionNode({ data, selected }: NodeProps) {
  return (
    <div className="relative flex items-center justify-center" style={{ width: 130, height: 70 }}>
      <Handle type="target" position={Position.Top} className="!bg-[#00ff41] !border-[#00ff41] !w-2 !h-2" style={{ top: 0 }} />
      <div
        className={cn(
          "absolute inset-0 font-mono text-xs flex items-center justify-center",
          "border bg-[#050f05]",
          selected ? "border-[#00ff41] text-[#00ff41]" : "border-[#00ff41]/50 text-[#00ff41]/80",
        )}
        style={{ transform: "rotate(45deg)", borderRadius: 2 }}
      />
      <span className="relative z-10 text-center px-2 break-words font-mono text-xs text-[#00ff41]">
        {String(data.label)}
      </span>
      <Handle type="source" position={Position.Bottom} id="yes" className="!bg-[#00ff41] !border-[#00ff41] !w-2 !h-2" style={{ bottom: 0 }} />
      <Handle type="source" position={Position.Right} id="no" className="!bg-[#00ff41] !border-[#00ff41] !w-2 !h-2" style={{ right: 0 }} />
    </div>
  );
}

function DbNode({ data, selected }: NodeProps) {
  return (
    <div className="relative flex flex-col items-center" style={{ width: 120 }}>
      <Handle type="target" position={Position.Top} className="!bg-[#00ff41] !border-[#00ff41] !w-2 !h-2" style={{ top: 6 }} />
      <div
        className={cn(
          "w-full font-mono text-xs bg-[#050f05] border",
          selected ? "border-[#00ff41] text-[#00ff41]" : "border-[#00ff41]/50 text-[#00ff41]/80",
        )}
      >
        <div className={cn("border-b px-2 py-0.5 text-center", selected ? "border-[#00ff41]" : "border-[#00ff41]/50")}>
          ╔══╗
        </div>
        <div className="px-2 py-1.5 text-center break-words">{String(data.label)}</div>
        <div className={cn("border-t px-2 py-0.5 text-center", selected ? "border-[#00ff41]" : "border-[#00ff41]/50")}>
          ╚══╝
        </div>
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-[#00ff41] !border-[#00ff41] !w-2 !h-2" style={{ bottom: 6 }} />
    </div>
  );
}

function IoNode({ data, selected }: NodeProps) {
  return (
    <NodeShell selected={selected ?? false} className="skew-x-[-12deg]">
      <Handle type="target" position={Position.Top} className="!bg-[#00ff41] !border-[#00ff41] !w-2 !h-2 !skew-x-[12deg]" />
      <span className="skew-x-[12deg] text-center break-words">{String(data.label)}</span>
      <Handle type="source" position={Position.Bottom} className="!bg-[#00ff41] !border-[#00ff41] !w-2 !h-2 !skew-x-[12deg]" />
    </NodeShell>
  );
}

const NODE_TYPES = {
  process: ProcessNode,
  terminal: TerminalNode,
  decision: DecisionNode,
  db: DbNode,
  io: IoNode,
};

// ── Palette ─────────────────────────────────────────────────────────────────

const PALETTE: { type: string; label: string; display: string; description: string }[] = [
  { type: "terminal", label: "Start / End", display: "( START )", description: "Terminal" },
  { type: "process", label: "Process", display: "[ PROCESS ]", description: "Step / Action" },
  { type: "decision", label: "Decision", display: "◇ BRANCH", description: "Yes / No branch" },
  { type: "io", label: "Input / Output", display: "/ INPUT /", description: "Data in or out" },
  { type: "db", label: "Database", display: "╔ QUERY ╗\n╚══════╝", description: "DB / Query" },
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
  const [edges, setEdges] = useState<Edge[]>(initialData.edges as Edge[]);
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
          { ...connection, style: { stroke: "#00ff41", strokeWidth: 1.5 }, animated: false },
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
      nds.map((n) => n.id === selectedNode.id ? { ...n, data: { ...n.data, label: labelInput } } : n),
    );
    setSelectedNode((prev) => prev ? { ...prev, data: { ...prev.data, label: labelInput } } : null);
  };

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      if (!rfInstance || !reactFlowWrapper.current) return;
      const type = e.dataTransfer.getData("application/reactflow-type");
      const label = e.dataTransfer.getData("application/reactflow-label");
      if (!type) return;
      const bounds = reactFlowWrapper.current.getBoundingClientRect();
      const position = rfInstance.screenToFlowPosition({
        x: e.clientX - bounds.left,
        y: e.clientY - bounds.top,
      });
      const newNode: Node = {
        id: nextId(),
        type,
        position,
        data: { label },
      };
      setNodes((nds) => [...nds, newNode]);
    },
    [rfInstance],
  );

  const handleSave = async () => {
    await onSave({ nodes: nodes as FlowData["nodes"], edges: edges as FlowData["edges"] });
  };

  const handleDeleteSelected = useCallback(() => {
    if (!selectedNode) return;
    setNodes((nds) => nds.filter((n) => n.id !== selectedNode.id));
    setEdges((eds) => eds.filter((e) => e.source !== selectedNode.id && e.target !== selectedNode.id));
    setSelectedNode(null);
  }, [selectedNode]);

  return (
    <div className="flex h-full min-h-0">
      {/* Left palette */}
      <div className="w-44 shrink-0 border-r border-[#00ff41]/20 bg-[#050f05] flex flex-col gap-1 p-2 overflow-y-auto">
        <p className="font-mono text-[9px] tracking-widest text-[#00ff41]/50 mb-1 px-1">// DRAG TO CANVAS</p>
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
            <p className="font-mono text-[10px] text-[#00ff41] whitespace-pre-line leading-tight">{item.display}</p>
            <p className="font-mono text-[9px] text-[#00ff41]/50 mt-0.5">{item.description}</p>
          </div>
        ))}

        {/* Selected node panel */}
        {selectedNode && (
          <div className="mt-3 border-t border-[#00ff41]/20 pt-3 flex flex-col gap-2">
            <p className="font-mono text-[9px] tracking-widest text-[#00ff41]/50">// SELECTED NODE</p>
            <Input
              value={labelInput}
              onChange={(e) => setLabelInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleLabelSave(); }}
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
            onClick={() => void handleSave()}
            disabled={saving}
            className="w-full h-8 font-mono text-xs rounded-none bg-[#00ff41] text-[#050f05] hover:bg-[#00ff41]/90 font-bold"
          >
            {saving ? "SAVING…" : "SAVE"}
          </Button>
        </div>
      </div>

      {/* Canvas */}
      <div ref={reactFlowWrapper} className="flex-1 min-w-0 bg-[#020902]" onDragOver={onDragOver} onDrop={onDrop}>
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
          deleteKeyCode={["Delete", "Backspace"]}
          defaultEdgeOptions={{ style: { stroke: "#00ff41", strokeWidth: 1.5 }, animated: false }}
          style={{ background: "#020902" }}
        >
          <Background color="#00ff41" gap={24} size={0.5} style={{ opacity: 0.08 }} />
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
