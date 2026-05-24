import { Router } from "express";
import { eq, and, sql, count } from "drizzle-orm";
import { db } from "../lib/db";
import { projects, scopes, milestones, items, timeEntries, users } from "../lib/schema";
import { requireAuth } from "../lib/auth";

async function laborForMilestone(milestoneId: number): Promise<number> {
  const [row] = await db
    .select({
      cents: sql<number>`COALESCE(SUM(${timeEntries.minutes} * COALESCE(${users.hourlyRateCents}, 0) / 60.0), 0)`,
    })
    .from(timeEntries)
    .innerJoin(items, eq(items.id, timeEntries.itemId))
    .leftJoin(users, eq(users.clerkId, timeEntries.userId))
    .where(and(eq(items.milestoneId, milestoneId), eq(timeEntries.billable, true)));
  return Math.round(Number(row?.cents ?? 0));
}

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
    .orderBy(milestones.order, milestones.targetDate);

  // Attach item progress counts + labor rollup for each milestone
  const withProgress = await Promise.all(
    rows.map(async (m) => {
      const [total] = await db
        .select({ n: count() })
        .from(items)
        .where(eq(items.milestoneId, m.id));
      const [done] = await db
        .select({ n: count() })
        .from(items)
        .where(and(eq(items.milestoneId, m.id), eq(items.status, "done")));
      const laborCents = await laborForMilestone(m.id);
      return {
        ...m,
        itemCount: Number(total?.n ?? 0),
        doneCount: Number(done?.n ?? 0),
        laborCents,
      };
    }),
  );

  return res.json(withProgress);
});

// POST /projects/:slug/milestones
router.post("/", requireAuth, async (req, res) => {
  const ctx = await getProjectScopeIds(String(req.params.slug));
  if (!ctx) return res.status(404).json({ error: "Not found" });

  const { scopeId, name, description, startDate, targetDate } = req.body;

  if (!ctx.scopeIds.includes(Number(scopeId))) {
    return res.status(403).json({ error: "Scope does not belong to this project" });
  }

  const [created] = await db
    .insert(milestones)
    .values({ scopeId: Number(scopeId), name, description, startDate, targetDate })
    .returning();
  return res.status(201).json({ ...created, itemCount: 0, doneCount: 0, laborCents: 0 });
});

// PATCH /projects/:slug/milestones/:milestoneId
router.patch("/:milestoneId", requireAuth, async (req, res) => {
  const ctx = await getProjectScopeIds(String(req.params.slug));
  if (!ctx) return res.status(404).json({ error: "Not found" });

  const { name, description, startDate, targetDate, status, order } = req.body;
  const [updated] = await db
    .update(milestones)
    .set({
      ...(name !== undefined && { name }),
      ...(description !== undefined && { description }),
      ...(startDate !== undefined && { startDate }),
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

  // Re-fetch counts + labor
  const [total] = await db.select({ n: count() }).from(items).where(eq(items.milestoneId, updated.id));
  const [done] = await db.select({ n: count() }).from(items).where(and(eq(items.milestoneId, updated.id), eq(items.status, "done")));
  const laborCents = await laborForMilestone(updated.id);

  return res.json({ ...updated, itemCount: Number(total?.n ?? 0), doneCount: Number(done?.n ?? 0), laborCents });
});

// DELETE /projects/:slug/milestones/:milestoneId
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
