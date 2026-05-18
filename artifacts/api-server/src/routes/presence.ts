import { Router } from "express";
import { eq, sql } from "drizzle-orm";
import { db } from "../lib/db";
import { presence, users, items, projectMembers } from "../lib/schema";
import { requireAuth, AuthRequest } from "../lib/auth";

const router = Router();

// GET /presence — scoped to users who share at least one project with the caller
router.get("/", requireAuth, async (req: AuthRequest, res) => {
  // Find the caller's project memberships
  const callerMemberships = await db
    .select({ projectId: projectMembers.projectId })
    .from(projectMembers)
    .where(eq(projectMembers.userId, req.userId!));

  const callerProjectIds = callerMemberships.map((m) => m.projectId);

  // Collect all user IDs who are members of any shared project
  const coMemberRows =
    callerProjectIds.length > 0
      ? await db
          .select({ userId: projectMembers.userId })
          .from(projectMembers)
          .where(
            sql`${projectMembers.projectId} = ANY(ARRAY[${sql.join(
              callerProjectIds.map((id) => sql`${id}`),
              sql`, `,
            )}]::int[])`,
          )
      : [];

  const coMemberIds = [...new Set(coMemberRows.map((r) => r.userId))];
  if (coMemberIds.length === 0) return res.json([]);

  // Fetch presence only for co-members
  const rows = await db
    .select()
    .from(presence)
    .where(
      sql`${presence.userId} = ANY(ARRAY[${sql.join(
        coMemberIds.map((id) => sql`${id}`),
        sql`, `,
      )}]::text[])`,
    );

  const userRows =
    rows.length > 0
      ? await db
          .select()
          .from(users)
          .where(
            sql`${users.clerkId} = ANY(ARRAY[${sql.join(
              rows.map((p) => sql`${p.userId}`),
              sql`, `,
            )}]::text[])`,
          )
      : [];

  const itemIds = rows.filter((p) => p.itemId).map((p) => p.itemId!);
  const itemRows =
    itemIds.length > 0
      ? await db
          .select()
          .from(items)
          .where(
            sql`${items.id} = ANY(ARRAY[${sql.join(
              itemIds.map((id) => sql`${id}`),
              sql`, `,
            )}]::int[])`,
          )
      : [];

  return res.json(
    rows.map((p) => ({
      ...p,
      user: userRows.find((u) => u.clerkId === p.userId) ?? null,
      item: itemRows.find((i) => i.id === p.itemId) ?? null,
    })),
  );
});

// PUT /presence
router.put("/", requireAuth, async (req: AuthRequest, res) => {
  const { itemId, note } = req.body;
  const [upserted] = await db
    .insert(presence)
    .values({ userId: req.userId!, itemId: itemId ?? null, note: note ?? null, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: presence.userId,
      set: { itemId: itemId ?? null, note: note ?? null, updatedAt: new Date() },
    })
    .returning();

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.clerkId, req.userId!))
    .limit(1);

  return res.json({ ...upserted, user: user ?? null, item: null });
});

export default router;
