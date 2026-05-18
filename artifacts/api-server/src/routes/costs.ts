import { Router } from "express";
import { eq, and } from "drizzle-orm";
import { db } from "../lib/db";
import { projects, costEntries } from "../lib/schema";
import { requireAuth, AuthRequest } from "../lib/auth";
import { logActivity } from "../lib/activity";

const router = Router({ mergeParams: true });

async function getProject(slug: string) {
  const [p] = await db.select().from(projects).where(eq(projects.slug, slug)).limit(1);
  return p ?? null;
}

// GET /projects/:slug/costs
router.get("/", requireAuth, async (req, res) => {
  const project = await getProject(String(req.params.slug));
  if (!project) return res.status(404).json({ error: "Not found" });

  const rows = await db
    .select()
    .from(costEntries)
    .where(eq(costEntries.projectId, project.id))
    .orderBy(costEntries.incurredOn);

  return res.json(rows);
});

// POST /projects/:slug/costs
router.post("/", requireAuth, async (req: AuthRequest, res) => {
  const project = await getProject(String(req.params.slug));
  if (!project) return res.status(404).json({ error: "Not found" });

  const { scopeId, category, vendor, description, amountCents, currency, recurring, incurredOn } =
    req.body;

  const [created] = await db
    .insert(costEntries)
    .values({
      projectId: project.id,
      scopeId,
      category,
      vendor,
      description,
      amountCents,
      currency: currency ?? "USD",
      recurring: recurring ?? false,
      incurredOn,
    })
    .returning();

  await logActivity("cost_added", req.userId!, project.id, {
    costId: created.id,
    category,
    amountCents,
  });

  return res.status(201).json(created);
});

// DELETE /projects/:slug/costs/:costId
// Constrain by projectId to prevent cross-project IDOR
router.delete("/:costId", requireAuth, async (req, res) => {
  const project = await getProject(String(req.params.slug));
  if (!project) return res.status(404).json({ error: "Not found" });

  await db
    .delete(costEntries)
    .where(
      and(
        eq(costEntries.id, Number(req.params.costId)),
        eq(costEntries.projectId, project.id),
      ),
    );

  return res.status(204).send();
});

export default router;
