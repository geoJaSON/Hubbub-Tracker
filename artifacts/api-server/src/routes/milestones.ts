import { Router } from "express";
import { eq } from "drizzle-orm";
import { db } from "../lib/db";
import { projects, scopes, milestones } from "../lib/schema";
import { requireAuth, AuthRequest } from "../lib/auth";

const router = Router({ mergeParams: true });

// GET /projects/:slug/milestones
router.get("/", requireAuth, async (req, res) => {
  const [project] = await db
    .select()
    .from(projects)
    .where(eq(projects.slug, req.params.slug))
    .limit(1);
  if (!project) return res.status(404).json({ error: "Not found" });

  const scopeRows = await db
    .select()
    .from(scopes)
    .where(eq(scopes.projectId, project.id));
  if (scopeRows.length === 0) return res.json([]);

  const { sql } = await import("drizzle-orm");
  const scopeIds = scopeRows.map((s) => s.id);
  const rows = await db
    .select()
    .from(milestones)
    .where(
      sql`${milestones.scopeId} = ANY(ARRAY[${sql.join(
        scopeIds.map((id) => sql`${id}`),
        sql`, `,
      )}]::int[])`,
    )
    .orderBy(milestones.order);

  return res.json(rows);
});

// POST /projects/:slug/milestones
router.post("/", requireAuth, async (req: AuthRequest, res) => {
  const { scopeId, name, description, targetDate } = req.body;
  const [created] = await db
    .insert(milestones)
    .values({ scopeId, name, description, targetDate })
    .returning();
  return res.status(201).json(created);
});

// PATCH /projects/:slug/milestones/:milestoneId
router.patch("/:milestoneId", requireAuth, async (req, res) => {
  const { name, description, targetDate, status, order } = req.body;
  const [updated] = await db
    .update(milestones)
    .set({
      ...(name !== undefined && { name }),
      ...(description !== undefined && { description }),
      ...(targetDate !== undefined && { targetDate }),
      ...(status !== undefined && { status }),
      ...(order !== undefined && { order }),
    })
    .where(eq(milestones.id, Number(req.params.milestoneId)))
    .returning();
  if (!updated) return res.status(404).json({ error: "Not found" });
  return res.json(updated);
});

// DELETE /projects/:slug/milestones/:milestoneId
router.delete("/:milestoneId", requireAuth, async (req, res) => {
  await db
    .delete(milestones)
    .where(eq(milestones.id, Number(req.params.milestoneId)));
  return res.status(204).send();
});

export default router;
