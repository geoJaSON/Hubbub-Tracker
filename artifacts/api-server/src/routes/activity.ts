import { Router } from "express";
import { eq, desc, sql } from "drizzle-orm";
import { db } from "../lib/db";
import { projects, activityEvents, users } from "../lib/schema";
import { requireAuth } from "../lib/auth";

const router = Router();

async function enrichEvents(rows: (typeof activityEvents.$inferSelect)[]) {
  const actorIds = [...new Set(rows.filter((e) => e.actorId).map((e) => e.actorId!))];
  const userRows =
    actorIds.length > 0
      ? await db
          .select()
          .from(users)
          .where(
            sql`${users.clerkId} = ANY(ARRAY[${sql.join(
              actorIds.map((id) => sql`${id}`),
              sql`, `,
            )}]::text[])`,
          )
      : [];

  const projectIds = [...new Set(rows.filter((e) => e.projectId).map((e) => e.projectId!))];
  const projectRows =
    projectIds.length > 0
      ? await db
          .select()
          .from(projects)
          .where(
            sql`${projects.id} = ANY(ARRAY[${sql.join(
              projectIds.map((id) => sql`${id}`),
              sql`, `,
            )}]::int[])`,
          )
      : [];

  return rows.map((e) => ({
    ...e,
    actor: userRows.find((u) => u.clerkId === e.actorId) ?? null,
    projectSlug: projectRows.find((p) => p.id === e.projectId)?.slug ?? null,
  }));
}

// GET /projects/:slug/activity
router.get("/projects/:slug/activity", requireAuth, async (req, res) => {
  const [project] = await db
    .select()
    .from(projects)
    .where(eq(projects.slug, req.params.slug))
    .limit(1);
  if (!project) return res.status(404).json({ error: "Not found" });

  const rows = await db
    .select()
    .from(activityEvents)
    .where(eq(activityEvents.projectId, project.id))
    .orderBy(desc(activityEvents.createdAt))
    .limit(50);

  return res.json(await enrichEvents(rows));
});

// GET /activity/recent
router.get("/activity/recent", requireAuth, async (_req, res) => {
  const rows = await db
    .select()
    .from(activityEvents)
    .orderBy(desc(activityEvents.createdAt))
    .limit(30);

  return res.json(await enrichEvents(rows));
});

export default router;
