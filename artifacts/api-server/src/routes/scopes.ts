import { Router } from "express";
import { eq, and, sum } from "drizzle-orm";
import { db } from "../lib/db";
import { projects, scopes, costEntries } from "../lib/schema";
import { requireAuth, AuthRequest } from "../lib/auth";

const router = Router({ mergeParams: true });

async function getProject(slug: string) {
  const [p] = await db.select().from(projects).where(eq(projects.slug, slug)).limit(1);
  return p ?? null;
}

// GET /projects/:slug/scopes
router.get("/", requireAuth, async (req, res) => {
  const project = await getProject(String(req.params.slug));
  if (!project) return res.status(404).json({ error: "Not found" });

  const rows = await db
    .select()
    .from(scopes)
    .where(eq(scopes.projectId, project.id))
    .orderBy(scopes.order);

  const withSpend = await Promise.all(
    rows.map(async (s) => {
      const [spent] = await db
        .select({ total: sum(costEntries.amountCents) })
        .from(costEntries)
        .where(eq(costEntries.scopeId, s.id));
      return { ...s, spentCents: spent?.total ? Number(spent.total) : 0 };
    }),
  );

  return res.json(withSpend);
});

// POST /projects/:slug/scopes
router.post("/", requireAuth, async (req: AuthRequest, res) => {
  const project = await getProject(String(req.params.slug));
  if (!project) return res.status(404).json({ error: "Not found" });

  const { name, slug, sow, budgetCents, status, startDate, targetDate } = req.body;
  const [created] = await db
    .insert(scopes)
    .values({
      projectId: project.id,
      name,
      slug,
      sow,
      budgetCents,
      status: status ?? "planned",
      startDate,
      targetDate,
    })
    .returning();

  return res.status(201).json({ ...created, spentCents: 0 });
});

// PATCH /projects/:slug/scopes/:scopeId
// Constrain update to scopes belonging to this project (IDOR prevention)
router.patch("/:scopeId", requireAuth, async (req, res) => {
  const project = await getProject(String(req.params.slug));
  if (!project) return res.status(404).json({ error: "Not found" });

  const { name, sow, budgetCents, status, startDate, targetDate, order } = req.body;
  const [updated] = await db
    .update(scopes)
    .set({
      ...(name !== undefined && { name }),
      ...(sow !== undefined && { sow }),
      ...(budgetCents !== undefined && { budgetCents }),
      ...(status !== undefined && { status }),
      ...(startDate !== undefined && { startDate }),
      ...(targetDate !== undefined && { targetDate }),
      ...(order !== undefined && { order }),
    })
    .where(
      and(
        eq(scopes.id, Number(req.params.scopeId)),
        eq(scopes.projectId, project.id),
      ),
    )
    .returning();

  if (!updated) return res.status(404).json({ error: "Not found" });
  return res.json(updated);
});

// DELETE /projects/:slug/scopes/:scopeId
// Constrain delete to scopes belonging to this project (IDOR prevention)
router.delete("/:scopeId", requireAuth, async (req, res) => {
  const project = await getProject(String(req.params.slug));
  if (!project) return res.status(404).json({ error: "Not found" });

  await db
    .delete(scopes)
    .where(
      and(
        eq(scopes.id, Number(req.params.scopeId)),
        eq(scopes.projectId, project.id),
      ),
    );

  return res.status(204).send();
});

export default router;
