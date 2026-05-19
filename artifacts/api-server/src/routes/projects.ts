import { Router } from "express";
import { eq, and, sql, count, gte, lte } from "drizzle-orm";
import { db } from "../lib/db";
import {
  projects,
  projectMembers,
  users,
  scopes,
  milestones,
  items,
  commits,
  timeEntries,
  costEntries,
} from "../lib/schema";
import { requireAuth, AuthRequest } from "../lib/auth";
import { logActivity } from "../lib/activity";
import { encrypt } from "../lib/crypto";

const router = Router();

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Strip write-only fields before sending a project to the client. */
function sanitizeProject<T extends { githubToken?: string | null }>(
  project: T,
): Omit<T, "githubToken"> & { hasGithubToken: boolean } {
  const { githubToken, ...safe } = project;
  return { ...safe, hasGithubToken: !!githubToken };
}

async function getProjectBySlug(slug: string) {
  const [p] = await db
    .select()
    .from(projects)
    .where(eq(projects.slug, slug))
    .limit(1);
  return p ?? null;
}

async function getMembership(projectId: number, userId: string) {
  const [m] = await db
    .select()
    .from(projectMembers)
    .where(
      and(
        eq(projectMembers.projectId, projectId),
        eq(projectMembers.userId, userId),
      ),
    )
    .limit(1);
  return m ?? null;
}

// ── GET /projects ─────────────────────────────────────────────────────────────
router.get("/", requireAuth, async (req: AuthRequest, res) => {
  const memberRows = await db
    .select({ projectId: projectMembers.projectId })
    .from(projectMembers)
    .where(eq(projectMembers.userId, req.userId!));

  const ids = memberRows.map((r) => r.projectId);
  if (ids.length === 0) return res.json([]);

  const rows = await db
    .select()
    .from(projects)
    .where(
      sql`${projects.id} = ANY(ARRAY[${sql.join(
        ids.map((id) => sql`${id}`),
        sql`, `,
      )}]::int[])`,
    )
    .orderBy(projects.name);

  const withCounts = await Promise.all(
    rows.map(async (p) => {
      const [memberCount] = await db
        .select({ count: count() })
        .from(projectMembers)
        .where(eq(projectMembers.projectId, p.id));
      const [openCount] = await db
        .select({ count: count() })
        .from(items)
        .where(
          and(
            eq(items.projectId, p.id),
            sql`${items.status} NOT IN ('done','cancelled')`,
          ),
        );
      return {
        ...sanitizeProject(p),
        memberCount: Number(memberCount?.count ?? 0),
        openItemCount: Number(openCount?.count ?? 0),
      };
    }),
  );

  return res.json(withCounts);
});

// ── POST /projects ─────────────────────────────────────────────────────────────
router.post("/", requireAuth, async (req: AuthRequest, res) => {
  const { name, slug, description, githubRepo } = req.body;
  const [project] = await db
    .insert(projects)
    .values({ name, slug, description, githubRepo })
    .returning();

  await db
    .insert(projectMembers)
    .values({ projectId: project.id, userId: req.userId!, role: "owner" });

  await logActivity("item_created", req.userId!, project.id, {
    kind: "project",
    projectId: project.id,
    name,
  });

  return res.status(201).json({
    ...sanitizeProject(project),
    memberCount: 1,
    openItemCount: 0,
  });
});

// ── GET /projects/:slug ────────────────────────────────────────────────────────
router.get("/:slug", requireAuth, async (req: AuthRequest, res) => {
  const slug = String(req.params.slug);
  const project = await getProjectBySlug(slug);
  if (!project) return res.status(404).json({ error: "Not found" });

  const membership = await getMembership(project.id, req.userId!);
  if (!membership) return res.status(403).json({ error: "Forbidden" });

  const [memberRows, scopeRows] = await Promise.all([
    db.select().from(projectMembers).where(eq(projectMembers.projectId, project.id)),
    db.select().from(scopes).where(eq(scopes.projectId, project.id)).orderBy(scopes.order),
  ]);

  const scopeIds = scopeRows.map((s) => s.id);
  const milestoneRows =
    scopeIds.length > 0
      ? await db
          .select()
          .from(milestones)
          .where(
            sql`${milestones.scopeId} = ANY(ARRAY[${sql.join(
              scopeIds.map((id) => sql`${id}`),
              sql`, `,
            )}]::int[])`,
          )
          .orderBy(milestones.order)
      : [];

  const userIds = [...new Set(memberRows.map((m) => m.userId))];
  const userRows =
    userIds.length > 0
      ? await db
          .select()
          .from(users)
          .where(
            sql`${users.clerkId} = ANY(ARRAY[${sql.join(
              userIds.map((id) => sql`${id}`),
              sql`, `,
            )}]::text[])`,
          )
      : [];

  return res.json({
    ...sanitizeProject(project),
    members: memberRows.map((m) => ({
      ...m,
      user: userRows.find((u) => u.clerkId === m.userId) ?? null,
    })),
    scopes: scopeRows.map((s) => ({
      ...s,
      milestones: milestoneRows.filter((ml) => ml.scopeId === s.id),
    })),
    milestones: milestoneRows,
  });
});

// ── PATCH /projects/:slug ──────────────────────────────────────────────────────
router.patch("/:slug", requireAuth, async (req: AuthRequest, res) => {
  const slug = String(req.params.slug);
  const project = await getProjectBySlug(slug);
  if (!project) return res.status(404).json({ error: "Not found" });

  const [caller] = await db
    .select()
    .from(users)
    .where(eq(users.clerkId, req.userId!))
    .limit(1);

  const membership = await getMembership(project.id, req.userId!);
  const isOwnerOrAdmin = membership?.role === "owner" || caller?.role === "admin";
  if (!isOwnerOrAdmin) return res.status(403).json({ error: "Forbidden: owners only" });

  const { name, description, githubRepo, githubToken, archived } = req.body;

  let encryptedToken: string | null | undefined;
  if (githubToken !== undefined) {
    if (!githubToken) {
      encryptedToken = null;
    } else {
      const result = encrypt(githubToken);
      if (result === null) {
        return res.status(500).json({ error: "ENCRYPTION_KEY is not configured; cannot store token" });
      }
      encryptedToken = result;
    }
  }

  const [updated] = await db
    .update(projects)
    .set({
      ...(name !== undefined && { name }),
      ...(description !== undefined && { description }),
      ...(githubRepo !== undefined && { githubRepo }),
      ...(encryptedToken !== undefined && { githubToken: encryptedToken }),
      ...(archived !== undefined && { archived }),
    })
    .where(eq(projects.slug, slug))
    .returning();

  return res.json(sanitizeProject(updated));
});

// ── DELETE /projects/:slug ─────────────────────────────────────────────────────
router.delete("/:slug", requireAuth, async (req: AuthRequest, res) => {
  const slug = String(req.params.slug);
  const project = await getProjectBySlug(slug);
  if (!project) return res.status(404).json({ error: "Not found" });

  const [caller] = await db
    .select()
    .from(users)
    .where(eq(users.clerkId, req.userId!))
    .limit(1);

  const membership = await getMembership(project.id, req.userId!);
  const isOwnerOrAdmin = membership?.role === "owner" || caller?.role === "admin";
  if (!isOwnerOrAdmin) return res.status(403).json({ error: "Forbidden: owners only" });

  await db.delete(projects).where(eq(projects.id, project.id));
  return res.status(204).send();
});

// ── GET /projects/:slug/members ────────────────────────────────────────────────
router.get("/:slug/members", requireAuth, async (req: AuthRequest, res) => {
  const slug = String(req.params.slug);
  const project = await getProjectBySlug(slug);
  if (!project) return res.status(404).json({ error: "Not found" });

  const membership = await getMembership(project.id, req.userId!);
  if (!membership) return res.status(403).json({ error: "Forbidden" });

  const memberRows = await db
    .select()
    .from(projectMembers)
    .where(eq(projectMembers.projectId, project.id));

  const userIds = memberRows.map((m) => m.userId);
  const userRows =
    userIds.length > 0
      ? await db
          .select()
          .from(users)
          .where(
            sql`${users.clerkId} = ANY(ARRAY[${sql.join(
              userIds.map((id) => sql`${id}`),
              sql`, `,
            )}]::text[])`,
          )
      : [];

  return res.json(
    memberRows.map((m) => ({
      ...m,
      user: userRows.find((u) => u.clerkId === m.userId) ?? null,
    })),
  );
});

// ── POST /projects/:slug/members ───────────────────────────────────────────────
router.post("/:slug/members", requireAuth, async (req: AuthRequest, res) => {
  const slug = String(req.params.slug);
  const project = await getProjectBySlug(slug);
  if (!project) return res.status(404).json({ error: "Not found" });

  const membership = await getMembership(project.id, req.userId!);
  if (membership?.role !== "owner")
    return res.status(403).json({ error: "Forbidden: owners only" });

  const { userId, role } = req.body;
  const [member] = await db
    .insert(projectMembers)
    .values({ projectId: project.id, userId, role: role ?? "member" })
    .onConflictDoNothing()
    .returning();

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.clerkId, userId))
    .limit(1);

  return res.status(201).json({ ...member, user: user ?? null });
});

// ── DELETE /projects/:slug/members/:userId ─────────────────────────────────────
router.delete(
  "/:slug/members/:userId",
  requireAuth,
  async (req: AuthRequest, res) => {
    const slug = String(req.params.slug);
    const project = await getProjectBySlug(slug);
    if (!project) return res.status(404).json({ error: "Not found" });

    const membership = await getMembership(project.id, req.userId!);
    if (membership?.role !== "owner")
      return res.status(403).json({ error: "Forbidden: owners only" });

    await db
      .delete(projectMembers)
      .where(
        and(
          eq(projectMembers.projectId, project.id),
          eq(projectMembers.userId, String(req.params.userId)),
        ),
      );

    return res.status(204).send();
  },
);

// ── GET /projects/:slug/report ──────────────────────────────────────────────
router.get("/:slug/report", requireAuth, async (req: AuthRequest, res) => {
  const slug = String(req.params.slug);
  const project = await getProjectBySlug(slug);
  if (!project) return res.status(404).json({ error: "Not found" });

  const membership = await getMembership(project.id, req.userId!);
  if (!membership) return res.status(403).json({ error: "Forbidden" });

  const toDate = req.query.to ? new Date(String(req.query.to)) : new Date();
  const fromDate = req.query.from
    ? new Date(String(req.query.from))
    : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const fromStr = fromDate.toISOString().slice(0, 10);
  const toStr = toDate.toISOString().slice(0, 10);

  const [allItems, memberRows, commitRows, timeRows, costRows, scopeRows] =
    await Promise.all([
      db.select().from(items).where(eq(items.projectId, project.id)),
      db.select().from(projectMembers).where(eq(projectMembers.projectId, project.id)),
      db
        .select()
        .from(commits)
        .where(
          and(
            eq(commits.projectId, project.id),
            gte(commits.committedAt, fromDate),
            lte(commits.committedAt, toDate),
          ),
        )
        .orderBy(sql`${commits.committedAt} DESC`),
      db
        .select()
        .from(timeEntries)
        .where(
          and(
            eq(timeEntries.projectId, project.id),
            gte(timeEntries.spentOn, fromStr),
            lte(timeEntries.spentOn, toStr),
          ),
        ),
      db.select().from(costEntries).where(eq(costEntries.projectId, project.id)),
      db.select().from(scopes).where(eq(scopes.projectId, project.id)),
    ]);

  const userIds = [...new Set(memberRows.map((m) => m.userId))];
  const userRows =
    userIds.length > 0
      ? await db
          .select()
          .from(users)
          .where(
            sql`${users.clerkId} = ANY(ARRAY[${sql.join(
              userIds.map((id) => sql`${id}`),
              sql`, `,
            )}]::text[])`,
          )
      : [];
  const userMap = Object.fromEntries(userRows.map((u) => [u.clerkId, u]));

  const itemsByStatus = allItems.reduce(
    (acc, item) => {
      (acc[item.status] ??= []).push(item);
      return acc;
    },
    {} as Record<string, typeof allItems>,
  );

  const timeByUser = timeRows.reduce(
    (acc, t) => {
      acc[t.userId] = (acc[t.userId] ?? 0) + t.minutes;
      return acc;
    },
    {} as Record<string, number>,
  );

  return res.json({
    project: sanitizeProject(project),
    reportPeriod: { from: fromDate.toISOString(), to: toDate.toISOString() },
    members: memberRows.map((m) => ({ ...m, user: userMap[m.userId] ?? null })),
    items: {
      total: allItems.length,
      byStatus: itemsByStatus,
    },
    commits: commitRows,
    time: {
      totalMinutes: timeRows.reduce((s, t) => s + t.minutes, 0),
      byUser: Object.entries(timeByUser).map(([userId, minutes]) => ({
        userId,
        displayName: userMap[userId]?.displayName ?? userId,
        minutes,
      })),
    },
    costs: {
      totalCents: costRows.reduce((s, c) => s + c.amountCents, 0),
      entries: costRows,
    },
    scopes: scopeRows,
  });
});

export default router;
