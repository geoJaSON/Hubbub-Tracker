import { Router } from "express";
import { eq, gte, and } from "drizzle-orm";
import { db } from "../lib/db";
import { items, timeEntries, activityEvents, standupCache } from "../lib/schema";
import { requireAuth, AuthRequest } from "../lib/auth";

const router = Router();

// GET /standup
// Returns today's standup for the authenticated user.
// Caches the generated content per (userId, date) so repeated calls are cheap.
router.get("/", requireAuth, async (req: AuthRequest, res) => {
  const today = new Date().toISOString().split("T")[0];

  // Check cache first
  const [cached] = await db
    .select()
    .from(standupCache)
    .where(and(eq(standupCache.userId, req.userId!), eq(standupCache.forDate, today)))
    .limit(1);

  if (cached) {
    return res.json({
      userId: req.userId,
      forDate: today,
      content: cached.content,
      generatedAt: cached.generatedAt.toISOString(),
      cached: true,
    });
  }

  // Generate standup
  const yesterday = new Date(Date.now() - 86_400_000).toISOString().split("T")[0];

  const [myActivity, myTime] = await Promise.all([
    db
      .select()
      .from(activityEvents)
      .where(
        and(
          eq(activityEvents.actorId, req.userId!),
          gte(activityEvents.createdAt, new Date(yesterday)),
        ),
      )
      .orderBy(activityEvents.createdAt),
    db
      .select()
      .from(timeEntries)
      .where(
        and(
          eq(timeEntries.userId, req.userId!),
          eq(timeEntries.spentOn, yesterday),
        ),
      ),
  ]);

  const totalMinutes = myTime.reduce((acc, t) => acc + t.minutes, 0);

  const lines: string[] = [];
  lines.push(`## Standup — ${today}`);
  lines.push("");
  lines.push("**Yesterday**");

  if (myActivity.length === 0 && myTime.length === 0) {
    lines.push("- No recorded activity");
  } else {
    if (totalMinutes > 0) {
      lines.push(`- Logged ${Math.floor(totalMinutes / 60)}h ${totalMinutes % 60}m`);
    }
    const statusChanges = myActivity.filter((e) => e.type === "item_status_changed");
    for (const e of statusChanges) {
      const p = e.payload as Record<string, unknown>;
      lines.push(`- Item #${p.number}: ${p.from} → ${p.to}`);
    }
    const created = myActivity.filter((e) => e.type === "item_created");
    for (const e of created) {
      const p = e.payload as Record<string, unknown>;
      if (p.kind !== "project") {
        lines.push(`- Created #${p.number}: ${p.title}`);
      }
    }
  }

  lines.push("");
  lines.push("**Today**");
  lines.push("- (fill in your plan here)");
  lines.push("");
  lines.push("**Blockers**");
  lines.push("- None");

  const content = lines.join("\n");

  // Store in cache (upsert)
  await db
    .insert(standupCache)
    .values({ userId: req.userId!, forDate: today, content })
    .onConflictDoUpdate({
      target: [standupCache.userId, standupCache.forDate],
      set: { content, generatedAt: new Date() },
    });

  return res.json({
    userId: req.userId,
    forDate: today,
    content,
    generatedAt: new Date().toISOString(),
    cached: false,
  });
});

// DELETE /standup — invalidate today's cache (force regeneration)
router.delete("/", requireAuth, async (req: AuthRequest, res) => {
  const today = new Date().toISOString().split("T")[0];
  await db
    .delete(standupCache)
    .where(and(eq(standupCache.userId, req.userId!), eq(standupCache.forDate, today)));
  return res.status(204).send();
});

export default router;
