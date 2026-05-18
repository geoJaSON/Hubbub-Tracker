import { Router } from "express";
import { eq, and, desc, sql } from "drizzle-orm";
import { db } from "../lib/db";
import { projects, activityEvents, users, projectMembers } from "../lib/schema";
import { requireAuth, AuthRequest } from "../lib/auth";

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

// GET /projects/:slug/activity — caller must be a project member
router.get("/projects/:slug/activity", requireAuth, async (req: AuthRequest, res) => {
  const slug = String(req.params.slug);
  const [project] = await db
    .select()
    .from(projects)
    .where(eq(projects.slug, slug))
    .limit(1);
  if (!project) return res.status(404).json({ error: "Not found" });

  // Enforce membership before returning project activity
  const [membership] = await db
    .select()
    .from(projectMembers)
    .where(
      and(
        eq(projectMembers.projectId, project.id),
        eq(projectMembers.userId, req.userId!),
      ),
    )
    .limit(1);
  if (!membership) return res.status(403).json({ error: "Forbidden" });

  const rows = await db
    .select()
    .from(activityEvents)
    .where(eq(activityEvents.projectId, project.id))
    .orderBy(desc(activityEvents.createdAt))
    .limit(50);

  return res.json(await enrichEvents(rows));
});

// GET /activity/recent — only events from projects the caller is a member of
router.get("/activity/recent", requireAuth, async (req: AuthRequest, res) => {
  const memberRows = await db
    .select({ projectId: projectMembers.projectId })
    .from(projectMembers)
    .where(eq(projectMembers.userId, req.userId!));

  const ids = memberRows.map((r) => r.projectId);
  if (ids.length === 0) return res.json([]);

  const rows = await db
    .select()
    .from(activityEvents)
    .where(
      sql`${activityEvents.projectId} = ANY(ARRAY[${sql.join(
        ids.map((id) => sql`${id}`),
        sql`, `,
      )}]::int[])`,
    )
    .orderBy(desc(activityEvents.createdAt))
    .limit(30);

  return res.json(await enrichEvents(rows));
});

export default router;
