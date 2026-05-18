import { Router } from "express";
import { eq, and } from "drizzle-orm";
import { db } from "../lib/db";
import { projects, docs } from "../lib/schema";
import { requireAuth, AuthRequest } from "../lib/auth";

const router = Router({ mergeParams: true });

// GET /projects/:slug/docs
router.get("/", requireAuth, async (req, res) => {
  const [project] = await db
    .select()
    .from(projects)
    .where(eq(projects.slug, req.params.slug))
    .limit(1);
  if (!project) return res.status(404).json({ error: "Not found" });

  const rows = await db
    .select()
    .from(docs)
    .where(eq(docs.projectId, project.id))
    .orderBy(docs.pinned, docs.title);

  return res.json(rows);
});

// POST /projects/:slug/docs
router.post("/", requireAuth, async (req: AuthRequest, res) => {
  const [project] = await db
    .select()
    .from(projects)
    .where(eq(projects.slug, req.params.slug))
    .limit(1);
  if (!project) return res.status(404).json({ error: "Not found" });

  const { title, slug, body, pinned } = req.body;
  const [created] = await db
    .insert(docs)
    .values({
      projectId: project.id,
      title,
      slug,
      body: body ?? "",
      pinned: pinned ?? false,
      createdById: req.userId,
    })
    .returning();

  return res.status(201).json(created);
});

// GET /projects/:slug/docs/:docSlug
router.get("/:docSlug", requireAuth, async (req, res) => {
  const [project] = await db
    .select()
    .from(projects)
    .where(eq(projects.slug, req.params.slug))
    .limit(1);
  if (!project) return res.status(404).json({ error: "Not found" });

  const [doc] = await db
    .select()
    .from(docs)
    .where(
      and(eq(docs.projectId, project.id), eq(docs.slug, req.params.docSlug)),
    )
    .limit(1);
  if (!doc) return res.status(404).json({ error: "Not found" });

  return res.json(doc);
});

// PATCH /projects/:slug/docs/:docSlug
router.patch("/:docSlug", requireAuth, async (req, res) => {
  const [project] = await db
    .select()
    .from(projects)
    .where(eq(projects.slug, req.params.slug))
    .limit(1);
  if (!project) return res.status(404).json({ error: "Not found" });

  const { title, body, pinned } = req.body;
  const [updated] = await db
    .update(docs)
    .set({
      ...(title !== undefined && { title }),
      ...(body !== undefined && { body }),
      ...(pinned !== undefined && { pinned }),
      updatedAt: new Date(),
    })
    .where(
      and(eq(docs.projectId, project.id), eq(docs.slug, req.params.docSlug)),
    )
    .returning();
  if (!updated) return res.status(404).json({ error: "Not found" });
  return res.json(updated);
});

// DELETE /projects/:slug/docs/:docSlug
router.delete("/:docSlug", requireAuth, async (req, res) => {
  const [project] = await db
    .select()
    .from(projects)
    .where(eq(projects.slug, req.params.slug))
    .limit(1);
  if (!project) return res.status(404).json({ error: "Not found" });

  await db
    .delete(docs)
    .where(
      and(eq(docs.projectId, project.id), eq(docs.slug, req.params.docSlug)),
    );
  return res.status(204).send();
});

export default router;
