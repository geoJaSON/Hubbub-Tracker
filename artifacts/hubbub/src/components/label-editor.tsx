import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { listLabels, createLabel, deleteLabel, setItemLabels } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { X, Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ItemLabel {
  id: number;
  name: string;
  color: string;
}

const PALETTE = [
  "#22c55e", "#eab308", "#3b82f6", "#a855f7",
  "#ef4444", "#06b6d4", "#f97316", "#ec4899",
];

export function LabelEditor({
  slug,
  itemNumber,
  labels,
  onChanged,
}: {
  slug: string;
  itemNumber: number;
  labels: ItemLabel[];
  onChanged: () => void;
}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState(PALETTE[0]);

  const { data: all = [] } = useQuery({
    queryKey: ["labels", slug],
    queryFn: () => listLabels(slug),
    enabled: open,
  });

  const appliedIds = labels.map((l) => l.id);
  const applied = new Set(appliedIds);

  const setLabels = useMutation({
    mutationFn: (ids: number[]) => setItemLabels(slug, itemNumber, ids),
    onSuccess: onChanged,
  });

  const create = useMutation({
    mutationFn: () => createLabel(slug, newName.trim(), newColor),
    onSuccess: (label) => {
      setNewName("");
      qc.invalidateQueries({ queryKey: ["labels", slug] });
      setLabels.mutate([...appliedIds, label.id]);
    },
  });

  const del = useMutation({
    mutationFn: (id: number) => deleteLabel(slug, id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["labels", slug] });
      onChanged();
    },
  });

  const available = all.filter((l) => !applied.has(l.id));

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1.5">
        {labels.map((l) => (
          <span
            key={l.id}
            className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[11px] font-mono rounded-sm border"
            style={{ borderColor: l.color, color: l.color }}
          >
            {l.name}
            <button
              onClick={() => setLabels.mutate(appliedIds.filter((x) => x !== l.id))}
              className="hover:text-foreground"
              title="Remove label"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        <Button
          size="sm"
          variant="ghost"
          className="h-6 px-1.5 font-mono text-[11px] text-muted-foreground hover:text-primary border border-border gap-1 rounded-sm"
          onClick={() => setOpen((o) => !o)}
        >
          <Plus className="h-3 w-3" /> LABEL
        </Button>
      </div>

      {open && (
        <div className="border border-border bg-card p-2 space-y-2">
          <div className="flex flex-wrap gap-1">
            {available.map((l) => (
              <span key={l.id} className="inline-flex items-center gap-0.5">
                <button
                  onClick={() => setLabels.mutate([...appliedIds, l.id])}
                  className="px-1.5 py-0.5 text-[11px] font-mono rounded-sm border hover:opacity-75"
                  style={{ borderColor: l.color, color: l.color }}
                >
                  {l.name}
                </button>
                <button
                  onClick={() => del.mutate(l.id)}
                  className="text-muted-foreground hover:text-destructive"
                  title="Delete label from project"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </span>
            ))}
            {available.length === 0 && (
              <span className="text-[11px] font-mono text-muted-foreground">
                no other labels — create one below
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5">
            <div className="flex gap-1">
              {PALETTE.map((c) => (
                <button
                  key={c}
                  onClick={() => setNewColor(c)}
                  className={cn(
                    "h-4 w-4 rounded-sm border",
                    newColor === c && "ring-1 ring-foreground ring-offset-1 ring-offset-card",
                  )}
                  style={{ background: c, borderColor: c }}
                  title={c}
                />
              ))}
            </div>
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="new label"
              className="h-7 font-mono text-xs rounded-none flex-1"
              onKeyDown={(e) => {
                if (e.key === "Enter" && newName.trim()) create.mutate();
              }}
            />
            <Button
              size="sm"
              onClick={() => create.mutate()}
              disabled={!newName.trim() || create.isPending}
              className="h-7 font-mono text-[11px] bg-primary text-primary-foreground hover:bg-primary/90"
            >
              ADD
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
