import { Router } from "express";
import { and, eq } from "drizzle-orm";
import { db } from "../lib/db";
import { projects, labels } from "../lib/schema";
import { requireAuth } from "../lib/auth";

// Mounted at /projects/:slug/labels behind the project-membership guard.
const router = Router({ mergeParams: true });

async function getProject(slug: string) {
  const [p] = await db
    .select()
    .from(projects)
    .where(eq(projects.slug, slug))
    .limit(1);
  return p ?? null;
}

// GET /projects/:slug/labels
router.get("/", requireAuth, async (req, res) => {
  const project = await getProject(String(req.params.slug));
  if (!project) return res.status(404).json({ error: "Not found" });
  const rows = await db
    .select()
    .from(labels)
    .where(eq(labels.projectId, project.id))
    .orderBy(labels.name);
  return res.json(rows);
});

// POST /projects/:slug/labels
router.post("/", requireAuth, async (req, res) => {
  const project = await getProject(String(req.params.slug));
  if (!project) return res.status(404).json({ error: "Not found" });
  const { name, color } = req.body as { name?: string; color?: string };
  if (!name || !String(name).trim()) {
    return res.status(400).json({ error: "name is required" });
  }
  try {
    const [created] = await db
      .insert(labels)
      .values({ projectId: project.id, name: String(name).trim(), ...(color ? { color } : {}) })
      .returning();
    return res.status(201).json(created);
  } catch {
    // unique (project_id, name) violation
    return res.status(409).json({ error: "A label with that name already exists" });
  }
});

// PATCH /projects/:slug/labels/:labelId
router.patch("/:labelId", requireAuth, async (req, res) => {
  const project = await getProject(String(req.params.slug));
  if (!project) return res.status(404).json({ error: "Not found" });
  const { name, color } = req.body as { name?: string; color?: string };
  const [updated] = await db
    .update(labels)
    .set({
      ...(name !== undefined && { name: String(name).trim() }),
      ...(color !== undefined && { color }),
    })
    .where(and(eq(labels.id, Number(req.params.labelId)), eq(labels.projectId, project.id)))
    .returning();
  if (!updated) return res.status(404).json({ error: "Not found" });
  return res.json(updated);
});

// DELETE /projects/:slug/labels/:labelId  (cascades to item_labels)
router.delete("/:labelId", requireAuth, async (req, res) => {
  const project = await getProject(String(req.params.slug));
  if (!project) return res.status(404).json({ error: "Not found" });
  const [deleted] = await db
    .delete(labels)
    .where(and(eq(labels.id, Number(req.params.labelId)), eq(labels.projectId, project.id)))
    .returning();
  if (!deleted) return res.status(404).json({ error: "Not found" });
  return res.json({ ok: true });
});

export default router;
