import { Router } from "express";
import { eq, and } from "drizzle-orm";
import { db } from "../lib/db";
import { projects, projectComponents } from "../lib/schema";
import { requireAuth } from "../lib/auth";

const router = Router({ mergeParams: true });

async function getProject(slug: string) {
  const [p] = await db
    .select()
    .from(projects)
    .where(eq(projects.slug, slug))
    .limit(1);
  return p ?? null;
}

// GET /projects/:slug/components
router.get("/", requireAuth, async (req, res) => {
  const project = await getProject(String(req.params.slug));
  if (!project) return res.status(404).json({ error: "Not found" });

  const rows = await db
    .select()
    .from(projectComponents)
    .where(eq(projectComponents.projectId, project.id))
    .orderBy(projectComponents.name);

  return res.json(rows);
});

// POST /projects/:slug/components
router.post("/", requireAuth, async (req, res) => {
  const project = await getProject(String(req.params.slug));
  if (!project) return res.status(404).json({ error: "Not found" });

  const { name, description } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: "name is required" });

  const existing = await db
    .select()
    .from(projectComponents)
    .where(
      and(
        eq(projectComponents.projectId, project.id),
        eq(projectComponents.name, name.trim()),
      ),
    )
    .limit(1);
  if (existing.length > 0) {
    return res.status(409).json({ error: "A component with that name already exists" });
  }

  const [created] = await db
    .insert(projectComponents)
    .values({ projectId: project.id, name: name.trim(), description: description ?? null })
    .returning();

  return res.status(201).json(created);
});

// PATCH /projects/:slug/components/:componentId
router.patch("/:componentId", requireAuth, async (req, res) => {
  const project = await getProject(String(req.params.slug));
  if (!project) return res.status(404).json({ error: "Not found" });

  const [existing] = await db
    .select()
    .from(projectComponents)
    .where(
      and(
        eq(projectComponents.id, Number(req.params.componentId)),
        eq(projectComponents.projectId, project.id),
      ),
    )
    .limit(1);
  if (!existing) return res.status(404).json({ error: "Not found" });

  const { name, description } = req.body;

  const [updated] = await db
    .update(projectComponents)
    .set({
      ...(name !== undefined && { name: name.trim() }),
      ...(description !== undefined && { description: description ?? null }),
    })
    .where(eq(projectComponents.id, existing.id))
    .returning();

  return res.json(updated);
});

// DELETE /projects/:slug/components/:componentId
router.delete("/:componentId", requireAuth, async (req, res) => {
  const project = await getProject(String(req.params.slug));
  if (!project) return res.status(404).json({ error: "Not found" });

  await db
    .delete(projectComponents)
    .where(
      and(
        eq(projectComponents.id, Number(req.params.componentId)),
        eq(projectComponents.projectId, project.id),
      ),
    );

  return res.status(204).send();
});

export default router;
