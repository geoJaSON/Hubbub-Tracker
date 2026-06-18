import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListAttachments,
  useDeleteAttachment,
  getListAttachmentsQueryKey,
} from "@workspace/api-client-react";
import {
  uploadAttachment,
  downloadAttachment,
  type AttachmentEntityType,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Paperclip, Download, Trash2, Upload, Loader2 } from "lucide-react";

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function AttachmentsPanel({
  projectSlug,
  entityType,
  entityId,
}: {
  projectSlug: string;
  entityType: AttachmentEntityType;
  entityId: number;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const { data: attachments = [] } = useListAttachments(
    projectSlug,
    entityType,
    entityId,
  );
  const deleteAttachment = useDeleteAttachment();

  const invalidate = () =>
    qc.invalidateQueries({
      queryKey: getListAttachmentsQueryKey(projectSlug, entityType, entityId),
    });

  async function handleFiles(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        await uploadAttachment({ slug: projectSlug, entityType, entityId, file });
      }
      await invalidate();
    } catch (e) {
      toast({
        title: "Upload failed",
        description: (e as Error).message,
        variant: "destructive",
      });
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function handleDelete(id: number) {
    try {
      await deleteAttachment.mutateAsync({ slug: projectSlug, id });
      await invalidate();
    } catch (e) {
      toast({
        title: "Delete failed",
        description: (e as Error).message,
        variant: "destructive",
      });
    }
  }

  async function handleDownload(id: number, filename: string) {
    try {
      await downloadAttachment(projectSlug, id, filename);
    } catch (e) {
      toast({
        title: "Download failed",
        description: (e as Error).message,
        variant: "destructive",
      });
    }
  }

  return (
    <div
      className="border border-border bg-card p-4 space-y-3"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        handleFiles(e.dataTransfer.files);
      }}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-mono text-muted-foreground tracking-widest">
          // ATTACHMENTS
        </span>
        <Button
          type="button"
          variant="outline"
          className="h-7 font-mono text-xs gap-1"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
        >
          {uploading ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Upload className="h-3 w-3" />
          )}
          {uploading ? "UPLOADING" : "UPLOAD"}
        </Button>
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
      </div>

      {attachments.length === 0 ? (
        <p className="text-muted-foreground font-mono text-xs">
          no attachments — drop files here or click upload
        </p>
      ) : (
        <ul className="space-y-1">
          {attachments.map((a) => (
            <li key={a.id} className="flex items-center gap-2 text-xs font-mono">
              <Paperclip className="h-3 w-3 text-muted-foreground shrink-0" />
              <button
                type="button"
                onClick={() => handleDownload(a.id, a.filename)}
                className="text-foreground hover:text-accent truncate text-left"
                title={a.filename}
              >
                {a.filename}
              </button>
              <span className="text-muted-foreground shrink-0">
                {formatBytes(a.sizeBytes)}
              </span>
              <button
                type="button"
                onClick={() => handleDownload(a.id, a.filename)}
                className="ml-auto text-muted-foreground hover:text-accent shrink-0"
                title="Download"
              >
                <Download className="h-3 w-3" />
              </button>
              <button
                type="button"
                onClick={() => handleDelete(a.id)}
                className="text-muted-foreground hover:text-destructive shrink-0"
                title="Delete"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
