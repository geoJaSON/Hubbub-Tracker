import { Router } from "express";
import { eq, and, sql } from "drizzle-orm";
import { db } from "../lib/db";
import { projects, scopes, milestones } from "../lib/schema";
import { requireAuth } from "../lib/auth";

const router = Router({ mergeParams: true });

async function getProjectScopeIds(
  slug: string,
): Promise<{ projectId: number; scopeIds: number[] } | null> {
  const [project] = await db
    .select()
    .from(projects)
    .where(eq(projects.slug, slug))
    .limit(1);
  if (!project) return null;
  const rows = await db
    .select({ id: scopes.id })
    .from(scopes)
    .where(eq(scopes.projectId, project.id));
  return { projectId: project.id, scopeIds: rows.map((r) => r.id) };
}

function scopeIdInProject(scopeIds: number[]) {
  if (scopeIds.length === 0) return sql`FALSE`;
  return sql`${milestones.scopeId} = ANY(ARRAY[${sql.join(
    scopeIds.map((id) => sql`${id}`),
    sql`, `,
  )}]::int[])`;
}

// GET /projects/:slug/milestones
router.get("/", requireAuth, async (req, res) => {
  const ctx = await getProjectScopeIds(String(req.params.slug));
  if (!ctx) return res.status(404).json({ error: "Not found" });
  if (ctx.scopeIds.length === 0) return res.json([]);

  const rows = await db
    .select()
    .from(milestones)
    .where(scopeIdInProject(ctx.scopeIds))
    .orderBy(milestones.order);

  return res.json(rows);
});

// POST /projects/:slug/milestones
// Validates that the provided scopeId belongs to this project
router.post("/", requireAuth, async (req, res) => {
  const ctx = await getProjectScopeIds(String(req.params.slug));
  if (!ctx) return res.status(404).json({ error: "Not found" });

  const { scopeId, name, description, targetDate } = req.body;

  if (!ctx.scopeIds.includes(Number(scopeId))) {
    return res.status(403).json({ error: "Scope does not belong to this project" });
  }

  const [created] = await db
    .insert(milestones)
    .values({ scopeId: Number(scopeId), name, description, targetDate })
    .returning();
  return res.status(201).json(created);
});

// PATCH /projects/:slug/milestones/:milestoneId
// Constrain to milestones whose scope belongs to this project (IDOR prevention)
router.patch("/:milestoneId", requireAuth, async (req, res) => {
  const ctx = await getProjectScopeIds(String(req.params.slug));
  if (!ctx) return res.status(404).json({ error: "Not found" });

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
    .where(
      and(
        eq(milestones.id, Number(req.params.milestoneId)),
        scopeIdInProject(ctx.scopeIds),
      ),
    )
    .returning();

  if (!updated) return res.status(404).json({ error: "Not found" });
  return res.json(updated);
});

// DELETE /projects/:slug/milestones/:milestoneId
// Constrain to milestones whose scope belongs to this project (IDOR prevention)
router.delete("/:milestoneId", requireAuth, async (req, res) => {
  const ctx = await getProjectScopeIds(String(req.params.slug));
  if (!ctx) return res.status(404).json({ error: "Not found" });

  await db
    .delete(milestones)
    .where(
      and(
        eq(milestones.id, Number(req.params.milestoneId)),
        scopeIdInProject(ctx.scopeIds),
      ),
    );

  return res.status(204).send();
});

export default router;
