import { Router } from "express";
import { eq, desc } from "drizzle-orm";
import { db } from "../lib/db";
import { projects, messages, users } from "../lib/schema";
import { requireAuth, AuthRequest } from "../lib/auth";
import { logActivity } from "../lib/activity";

const router = Router({ mergeParams: true });

// GET /projects/:slug/messages
router.get("/", requireAuth, async (req, res) => {
  const [project] = await db
    .select()
    .from(projects)
    .where(eq(projects.slug, req.params.slug))
    .limit(1);
  if (!project) return res.status(404).json({ error: "Not found" });

  const { sql } = await import("drizzle-orm");
  const rows = await db
    .select()
    .from(messages)
    .where(eq(messages.projectId, project.id))
    .orderBy(desc(messages.createdAt))
    .limit(100);

  rows.reverse();

  const authorIds = [...new Set(rows.map((m) => m.authorId))];
  const userRows =
    authorIds.length > 0
      ? await db
          .select()
          .from(users)
          .where(
            sql`${users.clerkId} = ANY(ARRAY[${sql.join(
              authorIds.map((id) => sql`${id}`),
              sql`, `,
            )}]::text[])`,
          )
      : [];

  return res.json(
    rows.map((m) => ({
      ...m,
      author: userRows.find((u) => u.clerkId === m.authorId) ?? null,
    })),
  );
});

// POST /projects/:slug/messages
router.post("/", requireAuth, async (req: AuthRequest, res) => {
  const [project] = await db
    .select()
    .from(projects)
    .where(eq(projects.slug, req.params.slug))
    .limit(1);
  if (!project) return res.status(404).json({ error: "Not found" });

  const [created] = await db
    .insert(messages)
    .values({
      projectId: project.id,
      authorId: req.userId!,
      body: req.body.body,
    })
    .returning();

  await logActivity("message_posted", req.userId!, project.id, {
    messageId: created.id,
  });

  const [author] = await db
    .select()
    .from(users)
    .where(eq(users.clerkId, req.userId!))
    .limit(1);

  return res.status(201).json({ ...created, author: author ?? null });
});

export default router;
