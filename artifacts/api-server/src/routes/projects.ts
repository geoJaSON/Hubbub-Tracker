import { Router } from "express";
import { eq, and, sql, count } from "drizzle-orm";
import { db } from "../lib/db";
import {
  projects,
  projectMembers,
  users,
  scopes,
  milestones,
  items,
} from "../lib/schema";
import { requireAuth, AuthRequest } from "../lib/auth";
import { logActivity } from "../lib/activity";

const router = Router();

// ── Helpers ──────────────────────────────────────────────────────────────────

async function getProjectBySlug(slug: string) {
  const [p] = await db
    .select()
    .from(projects)
    .where(eq(projects.slug, slug))
    .limit(1);
  return p ?? null;
}

/** Returns the caller's membership row, or null if not a member. */
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
        ...p,
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
    ...project,
    memberCount: 1,
    openItemCount: 0,
  });
});

// ── GET /projects/:slug ────────────────────────────────────────────────────────
router.get("/:slug", requireAuth, async (req: AuthRequest, res) => {
  const project = await getProjectBySlug(req.params.slug);
  if (!project) return res.status(404).json({ error: "Not found" });

  // Membership check — any member can read
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
    ...project,
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
// Restricted to owners or global admins
router.patch("/:slug", requireAuth, async (req: AuthRequest, res) => {
  const project = await getProjectBySlug(req.params.slug);
  if (!project) return res.status(404).json({ error: "Not found" });

  const [caller] = await db
    .select()
    .from(users)
    .where(eq(users.clerkId, req.userId!))
    .limit(1);

  const membership = await getMembership(project.id, req.userId!);
  const isOwnerOrAdmin = membership?.role === "owner" || caller?.role === "admin";
  if (!isOwnerOrAdmin) return res.status(403).json({ error: "Forbidden: owners only" });

  const { name, description, githubRepo, archived } = req.body;
  const [updated] = await db
    .update(projects)
    .set({
      ...(name !== undefined && { name }),
      ...(description !== undefined && { description }),
      ...(githubRepo !== undefined && { githubRepo }),
      ...(archived !== undefined && { archived }),
    })
    .where(eq(projects.slug, req.params.slug))
    .returning();

  return res.json(updated);
});

// ── DELETE /projects/:slug ─────────────────────────────────────────────────────
// Restricted to owners or global admins
router.delete("/:slug", requireAuth, async (req: AuthRequest, res) => {
  const project = await getProjectBySlug(req.params.slug);
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
  const project = await getProjectBySlug(req.params.slug);
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
// Restricted to owners
router.post("/:slug/members", requireAuth, async (req: AuthRequest, res) => {
  const project = await getProjectBySlug(req.params.slug);
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
// Restricted to owners (cannot remove yourself if last owner)
router.delete(
  "/:slug/members/:userId",
  requireAuth,
  async (req: AuthRequest, res) => {
    const project = await getProjectBySlug(req.params.slug);
    if (!project) return res.status(404).json({ error: "Not found" });

    const membership = await getMembership(project.id, req.userId!);
    if (membership?.role !== "owner")
      return res.status(403).json({ error: "Forbidden: owners only" });

    await db
      .delete(projectMembers)
      .where(
        and(
          eq(projectMembers.projectId, project.id),
          eq(projectMembers.userId, req.params.userId),
        ),
      );

    return res.status(204).send();
  },
);

export default router;
