import { Router } from "express";
import { eq, desc, sql } from "drizzle-orm";
import { db } from "../lib/db";
import { projects, commits, commitItems, items } from "../lib/schema";
import { requireAuth, AuthRequest } from "../lib/auth";
import { logActivity } from "../lib/activity";

const router = Router({ mergeParams: true });

// GET /projects/:slug/commits
router.get("/", requireAuth, async (req, res) => {
  const slug = String(req.params.slug);
  const [project] = await db
    .select()
    .from(projects)
    .where(eq(projects.slug, slug))
    .limit(1);
  if (!project) return res.status(404).json({ error: "Not found" });

  const rows = await db
    .select()
    .from(commits)
    .where(eq(commits.projectId, project.id))
    .orderBy(desc(commits.committedAt))
    .limit(50);

  return res.json(rows);
});

// POST /projects/:slug/commits  — ingest commits (GitHub webhook or polling)
router.post("/", requireAuth, async (req: AuthRequest, res) => {
  const slug = String(req.params.slug);
  const [project] = await db
    .select()
    .from(projects)
    .where(eq(projects.slug, slug))
    .limit(1);
  if (!project) return res.status(404).json({ error: "Not found" });

  const incoming: Array<{
    sha: string;
    message: string;
    authorName?: string;
    authorGithub?: string;
    url?: string;
    committedAt: string;
  }> = Array.isArray(req.body) ? req.body : [req.body];

  const inserted: (typeof commits.$inferSelect)[] = [];

  for (const c of incoming) {
    const [row] = await db
      .insert(commits)
      .values({
        projectId: project.id,
        sha: c.sha,
        message: c.message,
        authorName: c.authorName ?? null,
        authorGithub: c.authorGithub ?? null,
        url: c.url ?? null,
        committedAt: new Date(c.committedAt),
      })
      .onConflictDoNothing()
      .returning();

    if (row) {
      inserted.push(row);

      // Auto-link items referenced in commit message: "#123" or "fixes #123"
      const refs = [...c.message.matchAll(/#(\d+)/g)].map((m) => Number(m[1]));
      for (const num of refs) {
        const [item] = await db
          .select()
          .from(items)
          .where(
            sql`${items.projectId} = ${project.id} AND ${items.number} = ${num}`,
          )
          .limit(1);
        if (item) {
          const linked = await db
            .insert(commitItems)
            .values({ commitId: row.id, itemId: item.id })
            .onConflictDoNothing()
            .returning();
          if (linked.length > 0) {
            await logActivity("commit_linked", req.userId ?? null, project.id, {
              number: item.number,
              title: item.title,
              sha: row.sha.slice(0, 7),
            });
          }
        }
      }
    }
  }

  return res.status(201).json(inserted);
});

export default router;
