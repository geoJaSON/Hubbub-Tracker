import { Router } from "express";
import { eq, gte, and, sql } from "drizzle-orm";
import { db } from "../lib/db";
import { items, timeEntries, activityEvents } from "../lib/schema";
import { requireAuth, AuthRequest } from "../lib/auth";

const router = Router();

// GET /standup
router.get("/", requireAuth, async (req: AuthRequest, res) => {
  const today = new Date().toISOString().split("T")[0];
  const yesterday = new Date(Date.now() - 86400000).toISOString().split("T")[0];

  const myActivity = await db
    .select()
    .from(activityEvents)
    .where(
      and(
        eq(activityEvents.actorId, req.userId!),
        gte(activityEvents.createdAt, new Date(yesterday)),
      ),
    )
    .orderBy(activityEvents.createdAt);

  const myTime = await db
    .select()
    .from(timeEntries)
    .where(
      and(
        eq(timeEntries.userId, req.userId!),
        eq(timeEntries.spentOn, yesterday),
      ),
    );

  const totalMinutes = myTime.reduce((acc, t) => acc + t.minutes, 0);

  const lines: string[] = [];
  lines.push(`## Standup — ${today}`);
  lines.push("");
  lines.push("**Yesterday**");

  if (myActivity.length === 0 && myTime.length === 0) {
    lines.push("- No recorded activity");
  } else {
    if (totalMinutes > 0) {
      lines.push(`- Logged ${Math.round(totalMinutes / 60)}h ${totalMinutes % 60}m`);
    }
    const statusChanges = myActivity.filter(
      (e) => e.type === "item_status_changed",
    );
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
  lines.push("- (fill in)");
  lines.push("");
  lines.push("**Blockers**");
  lines.push("- None");

  const content = lines.join("\n");

  return res.json({
    userId: req.userId,
    forDate: today,
    content,
    generatedAt: new Date().toISOString(),
  });
});

export default router;
