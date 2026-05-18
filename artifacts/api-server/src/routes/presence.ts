import { Router } from "express";
import { eq, sql } from "drizzle-orm";
import { db } from "../lib/db";
import { presence, users, items } from "../lib/schema";
import { requireAuth, AuthRequest } from "../lib/auth";

const router = Router();

// GET /presence
router.get("/", requireAuth, async (_req, res) => {
  const rows = await db.select().from(presence);

  const userIds = rows.map((p) => p.userId);
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
