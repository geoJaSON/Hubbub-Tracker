import { Router } from "express";
import { eq, and, max, desc, asc, sql } from "drizzle-orm";
import { db } from "../lib/db";
import { projects, docs } from "../lib/schema";
import { requireAuth, AuthRequest } from "../lib/auth";

const router = Router({ mergeParams: true });

/**
 * Sanitize a ts_headline snippet so only bare <mark>…</mark> tags survive.
 * Strategy: HTML-encode the whole string, then restore only the safe pair
 * (&lt;mark&gt; → <mark> and &lt;/mark&gt; → </mark>).
 * Any user-authored HTML (scripts, event handlers, etc.) stays encoded.
 */
function sanitizeSnippet(raw: string): string {
  return raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/&lt;mark&gt;/g, "<mark>")
    .replace(/&lt;\/mark&gt;/g, "</mark>");
}

async function getProject(slug: string) {
  const [p] = await db.select().from(projects).where(eq(projects.slug, slug)).limit(1);
  return p ?? null;
}

// GET /projects/:slug/docs
router.get("/", requireAuth, async (req, res) => {
  const project = await getProject(String(req.params.slug));
  if (!project) return res.status(404).json({ error: "Not found" });

  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";

  if (q) {
    const rows = await db.execute(sql`
      SELECT
        id,
        project_id AS "projectId",
        title,
        slug,
        body,
        pinned,
        "order",
        created_by_id AS "createdById",
        created_at AS "createdAt",
        updated_at AS "updatedAt",
        ts_headline(
          'english',
          title || ' ' || COALESCE(body, ''),
          plainto_tsquery('english', ${q}),
          'StartSel=<mark>, StopSel=</mark>, MaxWords=35, MinWords=15, ShortWord=3, HighlightAll=false, MaxFragments=2, FragmentDelimiter=" … "'
        ) AS snippet
      FROM docs
      WHERE
        project_id = ${project.id}
        AND to_tsvector('english', title || ' ' || COALESCE(body, '')) @@ plainto_tsquery('english', ${q})
      ORDER BY
        ts_rank(
          to_tsvector('english', title || ' ' || COALESCE(body, '')),
          plainto_tsquery('english', ${q})
        ) DESC
    `);
    const sanitized = (rows.rows as Array<Record<string, unknown>>).map((row) => ({
      ...row,
      snippet: typeof row.snippet === "string" ? sanitizeSnippet(row.snippet) : null,
    }));
    return res.json(sanitized);
  }

  const rows = await db
    .select()
    .from(docs)
    .where(eq(docs.projectId, project.id))
    .orderBy(desc(docs.pinned), asc(docs.order), asc(docs.title));

  return res.json(rows);
});

// POST /projects/:slug/docs
router.post("/", requireAuth, async (req: AuthRequest, res) => {
  const project = await getProject(String(req.params.slug));
  if (!project) return res.status(404).json({ error: "Not found" });

  const { title, slug, body, pinned } = req.body;
  const [maxOrderRow] = await db
    .select({ maxOrder: max(docs.order) })
    .from(docs)
    .where(eq(docs.projectId, project.id));
  const nextOrder = (maxOrderRow?.maxOrder ?? -1) + 1;
  const [created] = await db
    .insert(docs)
    .values({
      projectId: project.id,
      title,
      slug,
      body: body ?? "",
      pinned: pinned ?? false,
      order: nextOrder,
      createdById: req.userId,
    })
    .returning();

  return res.status(201).json(created);
});

// GET /projects/:slug/docs/:docSlug
router.get("/:docSlug", requireAuth, async (req, res) => {
  const project = await getProject(String(req.params.slug));
  if (!project) return res.status(404).json({ error: "Not found" });

  const docSlug = String(req.params.docSlug);
  const [doc] = await db
    .select()
    .from(docs)
    .where(and(eq(docs.projectId, project.id), eq(docs.slug, docSlug)))
    .limit(1);
  if (!doc) return res.status(404).json({ error: "Not found" });

  return res.json(doc);
});

// PATCH /projects/:slug/docs/:docSlug
router.patch("/:docSlug", requireAuth, async (req, res) => {
  const project = await getProject(String(req.params.slug));
  if (!project) return res.status(404).json({ error: "Not found" });

  const docSlug = String(req.params.docSlug);
  const { title, body, pinned, order } = req.body;
  const [updated] = await db
    .update(docs)
    .set({
      ...(title !== undefined && { title }),
      ...(body !== undefined && { body }),
      ...(pinned !== undefined && { pinned }),
      ...(order !== undefined && { order }),
      updatedAt: new Date(),
    })
    .where(and(eq(docs.projectId, project.id), eq(docs.slug, docSlug)))
    .returning();
  if (!updated) return res.status(404).json({ error: "Not found" });
  return res.json(updated);
});

// DELETE /projects/:slug/docs/:docSlug
router.delete("/:docSlug", requireAuth, async (req, res) => {
  const project = await getProject(String(req.params.slug));
  if (!project) return res.status(404).json({ error: "Not found" });

  const docSlug = String(req.params.docSlug);
  await db
    .delete(docs)
    .where(and(eq(docs.projectId, project.id), eq(docs.slug, docSlug)));
  return res.status(204).send();
});

export default router;
