import { Router } from "express";
import { eq } from "drizzle-orm";
import { db } from "../lib/db";
import { projects, costEntries } from "../lib/schema";
import { requireAuth, AuthRequest } from "../lib/auth";
import { logActivity } from "../lib/activity";

const router = Router({ mergeParams: true });

// GET /projects/:slug/costs
router.get("/", requireAuth, async (req, res) => {
  const [project] = await db
    .select()
    .from(projects)
    .where(eq(projects.slug, req.params.slug))
    .limit(1);
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
  const [project] = await db
    .select()
    .from(projects)
    .where(eq(projects.slug, req.params.slug))
    .limit(1);
  if (!project) return res.status(404).json({ error: "Not found" });

  const {
    scopeId,
    category,
    vendor,
    description,
    amountCents,
    currency,
    recurring,
    incurredOn,
  } = req.body;

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
router.delete("/:costId", requireAuth, async (req, res) => {
  await db
    .delete(costEntries)
    .where(eq(costEntries.id, Number(req.params.costId)));
  return res.status(204).send();
});

export default router;
