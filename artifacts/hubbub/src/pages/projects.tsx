import { useState } from "react";
import { Link } from "wouter";
import { useListProjects, useCreateProject } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { getListProjectsQueryKey } from "@workspace/api-client-react";
import { Layout } from "../components/layout";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Plus, FolderKanban, ChevronRight, Archive } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

function slugify(s: string) {
  return s.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "").slice(0, 64);
}

export default function ProjectsPage() {
  const { data: projects = [], isLoading } = useListProjects();
  const createProject = useCreateProject();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [githubRepo, setGithubRepo] = useState("");

  const handleCreate = async () => {
    if (!name.trim()) return;
    try {
      await createProject.mutateAsync({ data: { name, slug: slug || slugify(name), description: description || null, githubRepo: githubRepo || null } });
      qc.invalidateQueries({ queryKey: getListProjectsQueryKey() });
      setOpen(false);
      setName(""); setSlug(""); setDescription(""); setGithubRepo("");
      toast({ title: "Project created" });
    } catch {
      toast({ title: "Failed to create project", variant: "destructive" });
    }
  };

  return (
    <Layout title="PROJECTS">
      <div className="max-w-4xl space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <p className="text-muted-foreground font-mono text-xs">
            {projects.length} project(s) loaded
          </p>
          <Button
            size="sm"
            className="gap-1.5 font-mono text-xs tracking-widest border border-primary bg-primary/10 text-primary hover:bg-primary/20"
            variant="ghost"
            onClick={() => setOpen(true)}
          >
            <Plus className="h-3.5 w-3.5" />
            NEW PROJECT
          </Button>
        </div>

        {/* List */}
        {isLoading ? (
          <div className="text-muted-foreground font-mono text-sm animate-pulse">LOADING...</div>
        ) : projects.length === 0 ? (
          <div className="border border-border bg-card p-8 text-center">
            <FolderKanban className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground font-mono text-sm">no projects yet</p>
            <Button variant="ghost" className="mt-3 text-primary border border-primary/50" onClick={() => setOpen(true)}>
              CREATE FIRST PROJECT
            </Button>
          </div>
        ) : (
          <div className="divide-y divide-border border border-border bg-card">
            {projects.map((p) => (
              <Link
                key={p.id}
                href={`/projects/${p.slug}`}
                className="flex items-center gap-4 px-4 py-4 hover:bg-muted/30 transition-colors group"
              >
                {p.archived ? (
                  <Archive className="h-4 w-4 text-muted-foreground shrink-0" />
                ) : (
                  <FolderKanban className="h-4 w-4 text-primary shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm text-foreground">{p.name}</span>
                    {p.archived && (
                      <span className="text-xs font-mono text-muted-foreground border border-border px-1">ARCHIVED</span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground font-mono">{p.slug}</p>
                  {p.description && (
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">{p.description}</p>
                  )}
                </div>
                <div className="flex items-center gap-4 text-xs text-muted-foreground font-mono">
                  <span>{p.memberCount ?? 0} members</span>
                  <span className="text-primary">{p.openItemCount ?? 0} open</span>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Create dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="bg-card border-border max-w-md">
          <DialogHeader>
            <DialogTitle className="font-['VT323'] tracking-widest text-xl text-primary">// NEW PROJECT</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="font-mono text-xs text-muted-foreground tracking-widest">NAME</Label>
              <Input
                value={name}
                onChange={(e) => { setName(e.target.value); setSlug(slugify(e.target.value)); }}
                className="bg-background border-border font-mono text-sm"
                placeholder="My Project"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="font-mono text-xs text-muted-foreground tracking-widest">SLUG</Label>
              <Input
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                className="bg-background border-border font-mono text-sm"
                placeholder="my-project"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="font-mono text-xs text-muted-foreground tracking-widest">DESCRIPTION</Label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="bg-background border-border font-mono text-sm resize-none"
                rows={2}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="font-mono text-xs text-muted-foreground tracking-widest">GITHUB REPO (optional)</Label>
              <Input
                value={githubRepo}
                onChange={(e) => setGithubRepo(e.target.value)}
                className="bg-background border-border font-mono text-sm"
                placeholder="owner/repo"
              />
            </div>
            <div className="flex gap-2 pt-2">
              <Button
                onClick={handleCreate}
                disabled={!name.trim() || createProject.isPending}
                className="flex-1 bg-primary text-primary-foreground font-mono text-xs tracking-widest hover:bg-primary/90"
              >
                {createProject.isPending ? "CREATING..." : "CREATE PROJECT"}
              </Button>
              <Button variant="ghost" onClick={() => setOpen(false)} className="border border-border font-mono text-xs">
                CANCEL
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
