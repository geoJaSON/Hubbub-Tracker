import { Router } from "express";
import { eq, and, count } from "drizzle-orm";
import { db } from "../lib/db";
import { projects, releases, items, projectComponents } from "../lib/schema";
import { requireAuth } from "../lib/auth";

const router = Router({ mergeParams: true });

async function getProject(slug: string) {
  const [p] = await db
    .select()
    .from(projects)
    .where(eq(projects.slug, slug))
    .limit(1);
  return p ?? null;
}

async function enrichRelease(release: typeof releases.$inferSelect) {
  const [total] = await db
    .select({ n: count() })
    .from(items)
    .where(eq(items.releaseId, release.id));
  const [done] = await db
    .select({ n: count() })
    .from(items)
    .where(and(eq(items.releaseId, release.id), eq(items.status, "done")));

  let component = null;
  if (release.componentId) {
    const [c] = await db
      .select()
      .from(projectComponents)
      .where(eq(projectComponents.id, release.componentId))
      .limit(1);
    component = c ?? null;
  }

  return {
    ...release,
    component,
    itemCount: Number(total?.n ?? 0),
    doneCount: Number(done?.n ?? 0),
  };
}

async function componentBelongsToProject(
  componentId: number,
  projectId: number,
): Promise<boolean> {
  const [c] = await db
    .select({ id: projectComponents.id })
    .from(projectComponents)
    .where(
      and(
        eq(projectComponents.id, componentId),
        eq(projectComponents.projectId, projectId),
      ),
    )
    .limit(1);
  return !!c;
}

// GET /projects/:slug/releases
router.get("/", requireAuth, async (req, res) => {
  const project = await getProject(String(req.params.slug));
  if (!project) return res.status(404).json({ error: "Not found" });

  const rows = await db
    .select()
    .from(releases)
    .where(eq(releases.projectId, project.id))
    .orderBy(releases.order, releases.targetDate, releases.createdAt);

  return res.json(await Promise.all(rows.map(enrichRelease)));
});

// POST /projects/:slug/releases
router.post("/", requireAuth, async (req, res) => {
  const project = await getProject(String(req.params.slug));
  if (!project) return res.status(404).json({ error: "Not found" });

  const { version, name, componentId, status, targetDate, releasedAt, changelog } =
    req.body;

  if (componentId != null && !(await componentBelongsToProject(Number(componentId), project.id))) {
    return res.status(403).json({ error: "Component does not belong to this project" });
  }

  const [created] = await db
    .insert(releases)
    .values({
      projectId: project.id,
      version,
      name: name ?? null,
      componentId: componentId ?? null,
      status: status ?? "planned",
      targetDate: targetDate ?? null,
      releasedAt: releasedAt ?? null,
      changelog: changelog ?? null,
    })
    .returning();

  return res.status(201).json(await enrichRelease(created));
});

// PATCH /projects/:slug/releases/:releaseId
router.patch("/:releaseId", requireAuth, async (req, res) => {
  const project = await getProject(String(req.params.slug));
  if (!project) return res.status(404).json({ error: "Not found" });

  const { version, name, componentId, status, targetDate, releasedAt, changelog, order } =
    req.body;

  if (componentId != null && !(await componentBelongsToProject(Number(componentId), project.id))) {
    return res.status(403).json({ error: "Component does not belong to this project" });
  }

  // Marking a release as released stamps releasedAt if the client didn't send one.
  const releasedAtValue =
    releasedAt !== undefined
      ? releasedAt
      : status === "released"
        ? new Date().toISOString().slice(0, 10)
        : undefined;

  const [updated] = await db
    .update(releases)
    .set({
      ...(version !== undefined && { version }),
      ...(name !== undefined && { name }),
      ...(componentId !== undefined && { componentId }),
      ...(status !== undefined && { status }),
      ...(targetDate !== undefined && { targetDate }),
      ...(releasedAtValue !== undefined && { releasedAt: releasedAtValue }),
      ...(changelog !== undefined && { changelog }),
      ...(order !== undefined && { order }),
    })
    .where(
      and(
        eq(releases.id, Number(req.params.releaseId)),
        eq(releases.projectId, project.id),
      ),
    )
    .returning();

  if (!updated) return res.status(404).json({ error: "Not found" });
  return res.json(await enrichRelease(updated));
});

// DELETE /projects/:slug/releases/:releaseId
router.delete("/:releaseId", requireAuth, async (req, res) => {
  const project = await getProject(String(req.params.slug));
  if (!project) return res.status(404).json({ error: "Not found" });

  await db
    .delete(releases)
    .where(
      and(
        eq(releases.id, Number(req.params.releaseId)),
        eq(releases.projectId, project.id),
      ),
    );

  return res.status(204).send();
});

export default router;
