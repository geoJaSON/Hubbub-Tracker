import { Router } from "express";
import { eq, and, sql, count, sum, desc } from "drizzle-orm";
import { db } from "../lib/db";
import {
  projects,
  projectMembers,
  items,
  presence,
  activityEvents,
  scopes,
  costEntries,
  users,
} from "../lib/schema";
import { requireAuth, AuthRequest } from "../lib/auth";

const router = Router();

// GET /dashboard
router.get("/", requireAuth, async (req: AuthRequest, res) => {
  const memberRows = await db
    .select({ projectId: projectMembers.projectId })
    .from(projectMembers)
    .where(eq(projectMembers.userId, req.userId!));

  const ids = memberRows.map((r) => r.projectId);
  const myProjects =
    ids.length > 0
      ? await db
          .select()
          .from(projects)
          .where(
            sql`${projects.id} = ANY(ARRAY[${sql.join(
              ids.map((id) => sql`${id}`),
              sql`, `,
            )}]::int[])`,
          )
      : [];

  const [openCount] = await db
    .select({ count: count() })
    .from(items)
    .where(
      ids.length > 0
        ? sql`${items.projectId} = ANY(ARRAY[${sql.join(
            ids.map((id) => sql`${id}`),
            sql`, `,
          )}]::int[]) AND ${items.status} NOT IN ('done','cancelled')`
        : sql`FALSE`,
    );

  const today = new Date().toISOString().split("T")[0];
  const [overdueCount] = await db
    .select({ count: count() })
    .from(items)
    .where(
      ids.length > 0
        ? sql`${items.projectId} = ANY(ARRAY[${sql.join(
            ids.map((id) => sql`${id}`),
            sql`, `,
          )}]::int[]) AND ${items.dueDate} < ${today} AND ${items.status} NOT IN ('done','cancelled')`
        : sql`FALSE`,
    );

  // Scope presence to users who share at least one project with the caller
  const presenceRows =
    ids.length > 0
      ? await db
          .select({ presence })
          .from(presence)
          .innerJoin(projectMembers, eq(projectMembers.userId, presence.userId))
          .where(
            sql`${projectMembers.projectId} = ANY(ARRAY[${sql.join(
              ids.map((id) => sql`${id}`),
              sql`, `,
            )}]::int[])`,
          )
          .then((rows) => rows.map((r) => r.presence))
      : [];
  const recentActivity =
    ids.length > 0
      ? await db
          .select()
          .from(activityEvents)
          .where(
            sql`${activityEvents.projectId} = ANY(ARRAY[${sql.join(
              ids.map((id) => sql`${id}`),
              sql`, `,
            )}]::int[])`,
          )
          .orderBy(desc(activityEvents.createdAt))
          .limit(20)
      : [];

  const projectActorIds = [...new Set(recentActivity.filter(e => e.actorId).map(e => e.actorId!))];
  const actorRows = projectActorIds.length > 0
    ? await db.select().from(users).where(
        sql`${users.clerkId} = ANY(ARRAY[${sql.join(projectActorIds.map(id => sql`${id}`), sql`, `)}]::text[])`
      )
    : [];

  return res.json({
    projects: myProjects.map((p) => ({ ...p, memberCount: 0, openItemCount: 0 })),
    openItems: Number(openCount?.count ?? 0),
    overdueItems: Number(overdueCount?.count ?? 0),
    itemsByStatus: {},
    teamPresence: presenceRows.map((p) => ({ ...p, user: null, item: null })),
    recentActivity: recentActivity.map(e => ({
      ...e,
      actor: actorRows.find(u => u.clerkId === e.actorId) ?? null,
      projectSlug: null,
    })),
  });
});

// GET /projects/:slug/burn-down
router.get("/projects/:slug/burn-down", requireAuth, async (req, res) => {
  const slug = String(req.params.slug);
  const [project] = await db
    .select()
    .from(projects)
    .where(eq(projects.slug, slug))
    .limit(1);
  if (!project) return res.status(404).json({ error: "Not found" });

  const scopeRows = await db
    .select()
    .from(scopes)
    .where(eq(scopes.projectId, project.id));

  const totalBudget = scopeRows.reduce(
    (acc, s) => acc + (s.budgetCents ?? 0),
    0,
  );

  const costRows = await db
    .select()
    .from(costEntries)
    .where(eq(costEntries.projectId, project.id))
    .orderBy(costEntries.incurredOn);

  const totalSpent = costRows.reduce((acc, c) => acc + c.amountCents, 0);

  const byDate: Record<string, number> = {};
  for (const c of costRows) {
    byDate[c.incurredOn] = (byDate[c.incurredOn] ?? 0) + c.amountCents;
  }

  let running = 0;
  const points = Object.entries(byDate)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, amt]) => {
      running += amt;
      return { date, budgetCents: totalBudget, spentCents: running, label: null };
    });

  const scopeBurndowns = await Promise.all(
    scopeRows.map(async (s) => {
      const [spent] = await db
        .select({ total: sum(costEntries.amountCents) })
        .from(costEntries)
        .where(eq(costEntries.scopeId, s.id));
      return {
        scopeId: s.id,
        scopeName: s.name,
        budgetCents: s.budgetCents ?? 0,
        spentCents: spent?.total ? Number(spent.total) : 0,
      };
    }),
  );

  return res.json({
    totalBudgetCents: totalBudget,
    totalSpentCents: totalSpent,
    points,
    scopes: scopeBurndowns,
  });
});

export default router;
