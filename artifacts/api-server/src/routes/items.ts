import { Router } from "express";
import { eq, and, sql, sum } from "drizzle-orm";
import { db } from "../lib/db";
import {
  projects,
  items,
  users,
  timeEntries,
  comments,
  commits,
  commitItems,
} from "../lib/schema";
import { requireAuth, AuthRequest } from "../lib/auth";
import { logActivity } from "../lib/activity";

const router = Router({ mergeParams: true });

async function getProject(slug: string) {
  const [p] = await db
    .select()
    .from(projects)
    .where(eq(projects.slug, slug))
    .limit(1);
  return p ?? null;
}

async function enrichItem(item: typeof items.$inferSelect) {
  const [timeSum] = await db
    .select({ total: sum(timeEntries.minutes) })
    .from(timeEntries)
    .where(eq(timeEntries.itemId, item.id));

  let assignee = null;
  if (item.assigneeId) {
    const [u] = await db
      .select()
      .from(users)
      .where(eq(users.clerkId, item.assigneeId))
      .limit(1);
    assignee = u ?? null;
  }

  return {
    ...item,
    assignee,
    totalMinutesLogged: timeSum?.total ? Number(timeSum.total) : 0,
  };
}

// GET /projects/:slug/items
router.get("/", requireAuth, async (req, res) => {
  const project = await getProject(String(req.params.slug));
  if (!project) return res.status(404).json({ error: "Not found" });

  const rows = await db
    .select()
    .from(items)
    .where(eq(items.projectId, project.id))
    .orderBy(items.createdAt);

  const enriched = await Promise.all(rows.map(enrichItem));
  return res.json(enriched);
});

// POST /projects/:slug/items
router.post("/", requireAuth, async (req: AuthRequest, res) => {
  const project = await getProject(String(req.params.slug));
  if (!project) return res.status(404).json({ error: "Not found" });

  const [{ max }] = await db
    .select({ max: sql<number>`COALESCE(MAX(${items.number}), 0)` })
    .from(items)
    .where(eq(items.projectId, project.id));

  const {
    type,
    title,
    description,
    status,
    priority,
    assigneeId,
    scopeId,
    milestoneId,
    estimateMinutes,
    dueDate,
    decisionRationale,
    category,
  } = req.body;

  const [created] = await db
    .insert(items)
    .values({
      projectId: project.id,
      number: Number(max) + 1,
      type,
      title,
      description,
      status: status ?? "open",
      priority: priority ?? "medium",
      assigneeId,
      scopeId,
      milestoneId,
      estimateMinutes,
      dueDate,
      decisionRationale,
      category: category ?? null,
    })
    .returning();

  await logActivity("item_created", req.userId!, project.id, {
    itemId: created.id,
    number: created.number,
    title,
    type,
  });

  if (type === "decision") {
    await logActivity("decision_logged", req.userId!, project.id, {
      itemId: created.id,
      title,
    });
  }

  return res.status(201).json(await enrichItem(created));
});

// GET /projects/:slug/items/:itemNumber
router.get("/:itemNumber", requireAuth, async (req, res) => {
  const project = await getProject(String(req.params.slug));
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

  const [commentRows, timeRows] = await Promise.all([
    db
      .select()
      .from(comments)
      .where(eq(comments.itemId, item.id))
      .orderBy(comments.createdAt),
    db
      .select()
      .from(timeEntries)
      .where(eq(timeEntries.itemId, item.id))
      .orderBy(timeEntries.spentOn),
  ]);

  const commitLinks = await db
    .select()
    .from(commitItems)
    .where(eq(commitItems.itemId, item.id));
  const commitIds = commitLinks.map((c) => c.commitId);
  const commitRows =
    commitIds.length > 0
      ? await db
          .select()
          .from(commits)
          .where(
            sql`${commits.id} = ANY(ARRAY[${sql.join(
              commitIds.map((id) => sql`${id}`),
              sql`, `,
            )}]::int[])`,
          )
      : [];

  const authorIds = [
    ...new Set([
      ...commentRows.map((c) => c.authorId),
      ...timeRows.map((t) => t.userId),
    ]),
  ];
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

  let assignee = null;
  if (item.assigneeId) {
    const [u] = await db
      .select()
      .from(users)
      .where(eq(users.clerkId, item.assigneeId))
      .limit(1);
    assignee = u ?? null;
  }

  const totalMinutesLogged = timeRows.reduce((acc, t) => acc + t.minutes, 0);

  return res.json({
    ...item,
    assignee,
    totalMinutesLogged,
    comments: commentRows.map((c) => ({
      ...c,
      author: userRows.find((u) => u.clerkId === c.authorId) ?? null,
    })),
    timeEntries: timeRows.map((t) => ({
      ...t,
      user: userRows.find((u) => u.clerkId === t.userId) ?? null,
    })),
    commits: commitRows,
  });
});

// PATCH /projects/:slug/items/:itemNumber
router.patch("/:itemNumber", requireAuth, async (req: AuthRequest, res) => {
  const project = await getProject(String(req.params.slug));
  if (!project) return res.status(404).json({ error: "Not found" });

  const [existing] = await db
    .select()
    .from(items)
    .where(
      and(
        eq(items.projectId, project.id),
        eq(items.number, Number(req.params.itemNumber)),
      ),
    )
    .limit(1);
  if (!existing) return res.status(404).json({ error: "Not found" });

  const {
    type,
    title,
    description,
    status,
    priority,
    assigneeId,
    scopeId,
    milestoneId,
    estimateMinutes,
    dueDate,
    decisionRationale,
    category,
  } = req.body;

  const closedAt =
    status &&
    ["done", "cancelled"].includes(status) &&
    !["done", "cancelled"].includes(existing.status)
      ? new Date()
      : undefined;

  const [updated] = await db
    .update(items)
    .set({
      ...(type !== undefined && { type }),
      ...(title !== undefined && { title }),
      ...(description !== undefined && { description }),
      ...(status !== undefined && { status }),
      ...(priority !== undefined && { priority }),
      ...(assigneeId !== undefined && { assigneeId }),
      ...(scopeId !== undefined && { scopeId }),
      ...(milestoneId !== undefined && { milestoneId }),
      ...(estimateMinutes !== undefined && { estimateMinutes }),
      ...(dueDate !== undefined && { dueDate }),
      ...(decisionRationale !== undefined && { decisionRationale }),
      ...(category !== undefined && { category: category ?? null }),
      ...(closedAt && { closedAt }),
    })
    .where(eq(items.id, existing.id))
    .returning();

  if (status && status !== existing.status) {
    await logActivity("item_status_changed", req.userId!, project.id, {
      itemId: existing.id,
      number: existing.number,
      from: existing.status,
      to: status,
    });
  }
  if (assigneeId && assigneeId !== existing.assigneeId) {
    await logActivity("item_assigned", req.userId!, project.id, {
      itemId: existing.id,
      number: existing.number,
      assigneeId,
    });
  }

  return res.json(await enrichItem(updated));
});

// DELETE /projects/:slug/items/:itemNumber
router.delete("/:itemNumber", requireAuth, async (req, res) => {
  const project = await getProject(String(req.params.slug));
  if (!project) return res.status(404).json({ error: "Not found" });

  await db
    .delete(items)
    .where(
      and(
        eq(items.projectId, project.id),
        eq(items.number, Number(req.params.itemNumber)),
      ),
    );
  return res.status(204).send();
});

export default router;
