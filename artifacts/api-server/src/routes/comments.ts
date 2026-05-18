import { Router } from "express";
import { eq, and } from "drizzle-orm";
import { db } from "../lib/db";
import { projects, items, comments, users } from "../lib/schema";
import { requireAuth, AuthRequest } from "../lib/auth";
import { logActivity } from "../lib/activity";

const router = Router({ mergeParams: true });

// GET /projects/:slug/items/:itemNumber/comments
router.get("/", requireAuth, async (req, res) => {
  const slug = String(req.params.slug);
  const [project] = await db
    .select()
    .from(projects)
    .where(eq(projects.slug, slug))
    .limit(1);
  if (!project) return res.status(404).json({ error: "Not found" });

  const [item] = await db
    .select()
    .from(items)
    .where(
      and(
        eq(items.projectId, project.id),
        eq(items.number, Number(req.params.itemNumber)),
      ),
    )
    .limit(1);
  if (!item) return res.status(404).json({ error: "Not found" });

  const rows = await db
    .select()
    .from(comments)
    .where(eq(comments.itemId, item.id))
    .orderBy(comments.createdAt);

  const { sql } = await import("drizzle-orm");
  const authorIds = [...new Set(rows.map((c) => c.authorId))];
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
    rows.map((c) => ({
      ...c,
      author: userRows.find((u) => u.clerkId === c.authorId) ?? null,
    })),
  );
});

// POST /projects/:slug/items/:itemNumber/comments
router.post("/", requireAuth, async (req: AuthRequest, res) => {
  const slug = String(req.params.slug);
  const [project] = await db
    .select()
    .from(projects)
    .where(eq(projects.slug, slug))
    .limit(1);
  if (!project) return res.status(404).json({ error: "Not found" });

  const [item] = await db
    .select()
    .from(items)
    .where(
      and(
        eq(items.projectId, project.id),
        eq(items.number, Number(req.params.itemNumber)),
      ),
    )
    .limit(1);
  if (!item) return res.status(404).json({ error: "Not found" });

  const [created] = await db
    .insert(comments)
    .values({ itemId: item.id, authorId: req.userId!, body: req.body.body })
    .returning();

  await logActivity("comment_added", req.userId!, project.id, {
    itemId: item.id,
    commentId: created.id,
  });

  const [author] = await db
    .select()
    .from(users)
    .where(eq(users.clerkId, req.userId!))
    .limit(1);

  return res.status(201).json({ ...created, author: author ?? null });
});

// PATCH /projects/:slug/items/:itemNumber/comments/:commentId
router.patch("/:commentId", requireAuth, async (req: AuthRequest, res) => {
  const slug = String(req.params.slug);
  const [project] = await db.select().from(projects).where(eq(projects.slug, slug)).limit(1);
  if (!project) return res.status(404).json({ error: "Not found" });
  const [item] = await db
    .select()
    .from(items)
    .where(and(eq(items.projectId, project.id), eq(items.number, Number(req.params.itemNumber))))
    .limit(1);
  if (!item) return res.status(404).json({ error: "Not found" });

  const [updated] = await db
    .update(comments)
    .set({ body: req.body.body, updatedAt: new Date() })
    .where(
      and(
        eq(comments.id, Number(req.params.commentId)),
        eq(comments.itemId, item.id),
        eq(comments.authorId, req.userId!),
      ),
    )
    .returning();
  if (!updated) return res.status(404).json({ error: "Not found" });
  return res.json(updated);
});

// DELETE /projects/:slug/items/:itemNumber/comments/:commentId
router.delete("/:commentId", requireAuth, async (req: AuthRequest, res) => {
  const slug = String(req.params.slug);
  const [project] = await db.select().from(projects).where(eq(projects.slug, slug)).limit(1);
  if (!project) return res.status(404).json({ error: "Not found" });
  const [item] = await db
    .select()
    .from(items)
    .where(and(eq(items.projectId, project.id), eq(items.number, Number(req.params.itemNumber))))
    .limit(1);
  if (!item) return res.status(404).json({ error: "Not found" });

  await db
    .delete(comments)
    .where(
      and(
        eq(comments.id, Number(req.params.commentId)),
        eq(comments.itemId, item.id),
        eq(comments.authorId, req.userId!),
      ),
    );
  return res.status(204).send();
});

export default router;
