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
  timeEntries,
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

  const intArray = (xs: number[]) =>
    sql`ARRAY[${sql.join(xs.map((x) => sql`${x}`), sql`, `)}]::int[]`;
  const textArray = (xs: string[]) =>
    sql`ARRAY[${sql.join(xs.map((x) => sql`${x}`), sql`, `)}]::text[]`;
  const activeItemScope =
    ids.length > 0
      ? sql`${items.projectId} = ANY(${intArray(ids)}) AND ${items.status} NOT IN ('done','cancelled')`
      : sql`FALSE`;
  const projectSlugById = new Map(myProjects.map((p) => [p.id, p.slug]));

  const projectActorIds = [...new Set(recentActivity.filter((e) => e.actorId).map((e) => e.actorId!))];
  const actorRows =
    projectActorIds.length > 0
      ? await db.select().from(users).where(sql`${users.clerkId} = ANY(${textArray(projectActorIds)})`)
      : [];

  // Per-project member + open-item counts
  const memberCountRows =
    ids.length > 0
      ? await db
          .select({ projectId: projectMembers.projectId, c: count() })
          .from(projectMembers)
          .where(sql`${projectMembers.projectId} = ANY(${intArray(ids)})`)
          .groupBy(projectMembers.projectId)
      : [];
  const openItemRows =
    ids.length > 0
      ? await db
          .select({ projectId: items.projectId, c: count() })
          .from(items)
          .where(
            sql`${items.projectId} = ANY(${intArray(ids)}) AND ${items.status} NOT IN ('done','cancelled')`,
          )
          .groupBy(items.projectId)
      : [];
  const memberCountByProject = new Map(memberCountRows.map((r) => [r.projectId, Number(r.c)]));
  const openItemByProject = new Map(openItemRows.map((r) => [r.projectId, Number(r.c)]));

  // Item counts grouped by status across the caller's projects
  const statusRows =
    ids.length > 0
      ? await db
          .select({ status: items.status, c: count() })
          .from(items)
          .where(sql`${items.projectId} = ANY(${intArray(ids)})`)
          .groupBy(items.status)
      : [];
  const itemsByStatus: Record<string, number> = Object.fromEntries(
    statusRows.map((r) => [r.status, Number(r.c)]),
  );

  const dueSoonEnd = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    .toISOString()
    .split("T")[0];
  const [myOpenRows, blockedRows, dueSoonRows] =
    ids.length > 0
      ? await Promise.all([
          db
            .select()
            .from(items)
            .where(sql`${activeItemScope} AND ${items.assigneeId} = ${req.userId!}`)
            .orderBy(items.dueDate, items.createdAt)
            .limit(6),
          db
            .select()
            .from(items)
            .where(sql`${activeItemScope} AND ${items.status} = 'blocked'`)
            .orderBy(items.dueDate, items.createdAt)
            .limit(6),
          db
            .select()
            .from(items)
            .where(
              sql`${activeItemScope} AND ${items.dueDate} >= ${today} AND ${items.dueDate} <= ${dueSoonEnd}`,
            )
            .orderBy(items.dueDate, items.createdAt)
            .limit(6),
        ])
      : [[], [], []];

  const toActionItem = (item: typeof items.$inferSelect) => ({
    ...item,
    projectSlug: projectSlugById.get(item.projectId) ?? "",
  });

  // Enrich presence rows with their user + the item they're working on
  const presenceUserRows =
    presenceRows.length > 0
      ? await db
          .select()
          .from(users)
          .where(sql`${users.clerkId} = ANY(${textArray(presenceRows.map((p) => p.userId))})`)
      : [];
  const presenceItemIds = presenceRows.filter((p) => p.itemId).map((p) => p.itemId!);
  const presenceItemRows =
    presenceItemIds.length > 0
      ? await db.select().from(items).where(sql`${items.id} = ANY(${intArray(presenceItemIds)})`)
      : [];

  return res.json({
    projects: myProjects.map(({ githubToken: _tok, ...p }) => ({
      ...p,
      memberCount: memberCountByProject.get(p.id) ?? 0,
      openItemCount: openItemByProject.get(p.id) ?? 0,
    })),
    openItems: Number(openCount?.count ?? 0),
    overdueItems: Number(overdueCount?.count ?? 0),
    itemsByStatus,
    myOpenItems: myOpenRows.map(toActionItem),
    blockedItems: blockedRows.map(toActionItem),
    dueSoonItems: dueSoonRows.map(toActionItem),
    teamPresence: presenceRows.map((p) => ({
      ...p,
      user: presenceUserRows.find((u) => u.clerkId === p.userId) ?? null,
      item: presenceItemRows.find((i) => i.id === p.itemId) ?? null,
    })),
    recentActivity: recentActivity.map((e) => ({
      ...e,
      actor: actorRows.find((u) => u.clerkId === e.actorId) ?? null,
      projectSlug: null,
    })),
  });
});

// GET /projects/:slug/burn-down
// Mounted in routes/index.ts at /projects/:slug/burn-down behind the project
// member guard (which supplies requireAuth + membership), so the served path is
// /api/projects/:slug/burn-down.
export const burnDownRouter = Router({ mergeParams: true });
burnDownRouter.get("/", async (req, res) => {
  const slug = String((req.params as { slug?: string }).slug);
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

  // Labor cost = sum over billable time entries of (minutes × hourly_rate / 60).
  // Attributed to a scope via the item's scopeId; entries on items without a
  // scope contribute to the project total but not to any scope row.
  const laborRows = await db
    .select({
      scopeId: items.scopeId,
      cents: sql<number>`COALESCE(SUM(${timeEntries.minutes} * COALESCE(${users.hourlyRateCents}, 0) / 60.0), 0)`,
    })
    .from(timeEntries)
    .innerJoin(items, eq(items.id, timeEntries.itemId))
    .leftJoin(users, eq(users.clerkId, timeEntries.userId))
    .where(and(eq(timeEntries.projectId, project.id), eq(timeEntries.billable, true)))
    .groupBy(items.scopeId);

  const laborByScope = new Map<number, number>();
  let totalLabor = 0;
  for (const row of laborRows) {
    const cents = Math.round(Number(row.cents));
    totalLabor += cents;
    if (row.scopeId != null) laborByScope.set(row.scopeId, cents);
  }

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
        laborCents: laborByScope.get(s.id) ?? 0,
      };
    }),
  );

  return res.json({
    totalBudgetCents: totalBudget,
    totalSpentCents: totalSpent,
    totalLaborCents: totalLabor,
    points,
    scopes: scopeBurndowns,
  });
});

export default router;
