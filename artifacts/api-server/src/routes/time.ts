import { Router } from "express";
import { eq, and } from "drizzle-orm";
import { db } from "../lib/db";
import { projects, items, timeEntries, users } from "../lib/schema";
import { requireAuth, AuthRequest } from "../lib/auth";

const router = Router({ mergeParams: true });

async function enrichEntry(t: typeof timeEntries.$inferSelect) {
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.clerkId, t.userId))
    .limit(1);
  return { ...t, user: user ?? null };
}

// GET /projects/:slug/items/:itemNumber/time
router.get("/items/:itemNumber/time", requireAuth, async (req, res) => {
  const slug = String(req.params.slug);
  const [project] = await db
    .select()
    .from(projects)
    .where(eq(projects.slug, slug))
    .limit(1);
  if (!project) return res.status(404).json({ error: "Not found" });

  const [item] = await db
    .select()
    .from(items)
    .where(
      and(
        eq(items.projectId, project.id),
        eq(items.number, Number(req.params.itemNumber)),
      ),
    )
    .limit(1);
  if (!item) return res.status(404).json({ error: "Not found" });

  const rows = await db
    .select()
    .from(timeEntries)
    .where(eq(timeEntries.itemId, item.id))
    .orderBy(timeEntries.spentOn);

  return res.json(await Promise.all(rows.map(enrichEntry)));
});

// POST /projects/:slug/items/:itemNumber/time
router.post(
  "/items/:itemNumber/time",
  requireAuth,
  async (req: AuthRequest, res) => {
    const slug = String(req.params.slug);
    const [project] = await db
      .select()
      .from(projects)
      .where(eq(projects.slug, slug))
      .limit(1);
    if (!project) return res.status(404).json({ error: "Not found" });

    const [item] = await db
      .select()
      .from(items)
      .where(
        and(
          eq(items.projectId, project.id),
          eq(items.number, Number(req.params.itemNumber)),
        ),
      )
      .limit(1);
    if (!item) return res.status(404).json({ error: "Not found" });

    const { minutes, billable, note, spentOn } = req.body;
    const [created] = await db
      .insert(timeEntries)
      .values({
        projectId: project.id,
        itemId: item.id,
        userId: req.userId!,
        minutes,
        billable: billable ?? true,
        note,
        spentOn,
      })
      .returning();

    return res.status(201).json(await enrichEntry(created));
  },
);

// GET /projects/:slug/time
router.get("/time", requireAuth, async (req, res) => {
  const slug = String(req.params.slug);
  const [project] = await db
    .select()
    .from(projects)
    .where(eq(projects.slug, slug))
    .limit(1);
  if (!project) return res.status(404).json({ error: "Not found" });

  const rows = await db
    .select()
    .from(timeEntries)
    .where(eq(timeEntries.projectId, project.id))
    .orderBy(timeEntries.spentOn);

  return res.json(await Promise.all(rows.map(enrichEntry)));
});

export default router;
