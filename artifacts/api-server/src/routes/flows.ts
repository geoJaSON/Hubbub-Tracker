import { Router } from "express";
import { eq, and } from "drizzle-orm";
import { db } from "../lib/db";
import { projects, flows } from "../lib/schema";
import { requireAuth } from "../lib/auth";

const router = Router({ mergeParams: true });

async function getProject(slug: string) {
  const [p] = await db.select().from(projects).where(eq(projects.slug, slug)).limit(1);
  return p ?? null;
}

// GET /projects/:slug/flows
router.get("/", requireAuth, async (req, res) => {
  const project = await getProject(String(req.params.slug));
  if (!project) return res.status(404).json({ error: "Not found" });
  const rows = await db
    .select()
    .from(flows)
    .where(eq(flows.projectId, project.id))
    .orderBy(flows.updatedAt);
  return res.json(rows);
});

// POST /projects/:slug/flows
router.post("/", requireAuth, async (req, res) => {
  const project = await getProject(String(req.params.slug));
  if (!project) return res.status(404).json({ error: "Not found" });
  const { title } = req.body as { title?: string };
  if (!title?.trim()) return res.status(400).json({ error: "title is required" });
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || `flow-${Date.now()}`;
  const [created] = await db
    .insert(flows)
    .values({ projectId: project.id, title: title.trim(), slug, data: { nodes: [], edges: [] } })
    .returning();
  return res.status(201).json(created);
});

// GET /projects/:slug/flows/:flowId
router.get("/:flowId", requireAuth, async (req, res) => {
  const project = await getProject(String(req.params.slug));
  if (!project) return res.status(404).json({ error: "Not found" });
  const [row] = await db
    .select()
    .from(flows)
    .where(and(eq(flows.id, Number(req.params.flowId)), eq(flows.projectId, project.id)))
    .limit(1);
  if (!row) return res.status(404).json({ error: "Not found" });
  return res.json(row);
});

// PATCH /projects/:slug/flows/:flowId
router.patch("/:flowId", requireAuth, async (req, res) => {
  const project = await getProject(String(req.params.slug));
  if (!project) return res.status(404).json({ error: "Not found" });
  const { title, data } = req.body as { title?: string; data?: unknown };
  const [updated] = await db
    .update(flows)
    .set({
      ...(title !== undefined && { title: title.trim() }),
      ...(data !== undefined && { data }),
      updatedAt: new Date(),
    })
    .where(and(eq(flows.id, Number(req.params.flowId)), eq(flows.projectId, project.id)))
    .returning();
  if (!updated) return res.status(404).json({ error: "Not found" });
  return res.json(updated);
});

// DELETE /projects/:slug/flows/:flowId
router.delete("/:flowId", requireAuth, async (req, res) => {
  const project = await getProject(String(req.params.slug));
  if (!project) return res.status(404).json({ error: "Not found" });
  await db
    .delete(flows)
    .where(and(eq(flows.id, Number(req.params.flowId)), eq(flows.projectId, project.id)));
  return res.status(204).send();
});

export default router;
