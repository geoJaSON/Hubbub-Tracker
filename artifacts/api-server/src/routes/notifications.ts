import { Router } from "express";
import { eq, and, isNull, desc, inArray, sql } from "drizzle-orm";
import { db } from "../lib/db";
import { notifications } from "../lib/schema";
import { requireAuth, AuthRequest } from "../lib/auth";

const router = Router();

// GET /notifications?unread=true&limit=50
router.get("/", requireAuth, async (req: AuthRequest, res) => {
  const unreadOnly = req.query.unread === "true";
  const limit = Math.min(Number(req.query.limit) || 50, 100);
  const where = unreadOnly
    ? and(
        eq(notifications.recipientId, req.userId!),
        isNull(notifications.readAt),
      )
    : eq(notifications.recipientId, req.userId!);

  const rows = await db
    .select()
    .from(notifications)
    .where(where)
    .orderBy(desc(notifications.createdAt))
    .limit(limit);
  return res.json(rows);
});

// GET /notifications/unread-count
router.get("/unread-count", requireAuth, async (req: AuthRequest, res) => {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(notifications)
    .where(
      and(
        eq(notifications.recipientId, req.userId!),
        isNull(notifications.readAt),
      ),
    );
  return res.json({ count: row?.count ?? 0 });
});

// POST /notifications/read  { ids?: number[], all?: boolean }
router.post("/read", requireAuth, async (req: AuthRequest, res) => {
  const { ids, all } = req.body as { ids?: number[]; all?: boolean };
  if (all) {
    await db
      .update(notifications)
      .set({ readAt: new Date() })
      .where(
        and(
          eq(notifications.recipientId, req.userId!),
          isNull(notifications.readAt),
        ),
      );
  } else if (Array.isArray(ids) && ids.length > 0) {
    await db
      .update(notifications)
      .set({ readAt: new Date() })
      .where(
        and(
          eq(notifications.recipientId, req.userId!),
          inArray(notifications.id, ids),
          isNull(notifications.readAt),
        ),
      );
  } else {
    return res.status(400).json({ error: "Provide ids[] or all=true" });
  }
  return res.status(204).send();
});

export default router;
