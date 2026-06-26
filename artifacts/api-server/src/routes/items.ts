import { Router } from "express";
import { eq, and, sql, sum, inArray } from "drizzle-orm";
import { db } from "../lib/db";
import {
  projects,
  items,
  users,
  timeEntries,
  comments,
  commits,
  commitItems,
  projectComponents,
  itemDependencies,
  labels,
  itemLabels,
} from "../lib/schema";
import { requireAuth, AuthRequest } from "../lib/auth";
import { logActivity } from "../lib/activity";
import { createNotifications, type NotificationType } from "../lib/notify";

const router = Router({ mergeParams: true });

async function getProject(slug: string) {
  const [p] = await db
    .select()
    .from(projects)
    .where(eq(projects.slug, slug))
    .limit(1);
  return p ?? null;
}

// Items this item is blocked by, plus a computed isBlocked flag (any blocker
// not yet done/cancelled). Kept separate from the manual "blocked" status.
async function getDependencies(itemId: number) {
  const blockedBy = await db
    .select({
      id: items.id,
      number: items.number,
      title: items.title,
      status: items.status,
    })
    .from(itemDependencies)
    .innerJoin(items, eq(itemDependencies.dependsOnItemId, items.id))
    .where(eq(itemDependencies.itemId, itemId));
  const isBlocked = blockedBy.some(
    (d) => d.status !== "done" && d.status !== "cancelled",
  );
  return { blockedBy, isBlocked };
}

// Labels currently applied to an item.
async function getItemLabels(itemId: number) {
  return db
    .select({ id: labels.id, name: labels.name, color: labels.color })
    .from(itemLabels)
    .innerJoin(labels, eq(itemLabels.labelId, labels.id))
    .where(eq(itemLabels.itemId, itemId))
    .orderBy(labels.name);
}

// Replace an item's labels with the given set (ignoring ids not in this project).
async function syncItemLabels(itemId: number, projectId: number, labelIds: number[]) {
  const valid = labelIds.length
    ? await db
        .select({ id: labels.id })
        .from(labels)
        .where(and(eq(labels.projectId, projectId), inArray(labels.id, labelIds)))
    : [];
  await db.delete(itemLabels).where(eq(itemLabels.itemId, itemId));
  if (valid.length) {
    await db.insert(itemLabels).values(valid.map((l) => ({ itemId, labelId: l.id })));
  }
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

  let component = null;
  if (item.componentId) {
    const [c] = await db
      .select()
      .from(projectComponents)
      .where(eq(projectComponents.id, item.componentId))
      .limit(1);
    component = c ?? null;
  }

  const { blockedBy, isBlocked } = await getDependencies(item.id);
  const itemLabelRows = await getItemLabels(item.id);

  return {
    ...item,
    assignee,
    component,
    totalMinutesLogged: timeSum?.total ? Number(timeSum.total) : 0,
    blockedBy,
    isBlocked,
    labels: itemLabelRows,
  };
}

// GET /projects/:slug/items
router.get("/", requireAuth, async (req, res) => {
  const project = await getProject(String(req.params.slug));
  if (!project) return res.status(404).json({ error: "Not found" });

  const includeClosed = req.query.includeClosed !== "false";

  const rows = await db
    .select()
    .from(items)
    .where(
      includeClosed
        ? eq(items.projectId, project.id)
        : and(
            eq(items.projectId, project.id),
            sql`${items.status} NOT IN ('done','cancelled')`,
          ),
    )
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
    componentId,
    labelIds,
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
      componentId: componentId ?? null,
    })
    .returning();

  if (Array.isArray(labelIds)) {
    await syncItemLabels(created.id, project.id, labelIds.map(Number));
  }

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
  const { blockedBy, isBlocked } = await getDependencies(item.id);
  const itemLabelRows = await getItemLabels(item.id);

  return res.json({
    ...item,
    assignee,
    totalMinutesLogged,
    blockedBy,
    isBlocked,
    labels: itemLabelRows,
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
    componentId,
    labelIds,
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
      ...(componentId !== undefined && { componentId: componentId ?? null }),
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

  // Notify the assignee on status change + the new assignee on (re)assignment.
  try {
    const recip = new Map<string, NotificationType>();
    if (status && status !== existing.status && existing.assigneeId) {
      recip.set(existing.assigneeId, "status_changed");
    }
    if (assigneeId && assigneeId !== existing.assigneeId) {
      recip.set(assigneeId, "assigned"); // assignment wins for the new assignee
    }
    recip.delete(req.userId!);
    await createNotifications(
      [...recip].map(([recipientId, type]) => ({
        recipientId,
        actorId: req.userId!,
        type,
        projectId: project.id,
        itemId: existing.id,
        payload: {
          slug: project.slug,
          itemNumber: existing.number,
          title: existing.title,
          status: status ?? existing.status,
        },
      })),
    );
  } catch (e) {
    console.error("item notify failed", e);
  }

  if (Array.isArray(labelIds)) {
    await syncItemLabels(existing.id, project.id, labelIds.map(Number));
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
