import { Router } from "express";
import { sql, ilike, or } from "drizzle-orm";
import { db } from "../lib/db";
import { items, docs, projects } from "../lib/schema";
import { requireAuth } from "../lib/auth";

const router = Router();

// GET /search?q=...
router.get("/", requireAuth, async (req, res) => {
  const q = String(req.query.q ?? "").trim();
  if (!q) return res.json({ results: [], total: 0 });

  const pattern = `%${q}%`;

  const [itemRows, docRows] = await Promise.all([
    db
      .select()
      .from(items)
      .where(or(ilike(items.title, pattern), ilike(items.description, pattern)))
      .limit(20),
    db
      .select()
      .from(docs)
      .where(or(ilike(docs.title, pattern), ilike(docs.body, pattern)))
      .limit(20),
  ]);

  const allProjectIds = [
    ...new Set([
      ...itemRows.map((i) => i.projectId),
      ...docRows.map((d) => d.projectId),
    ]),
  ];

  const projectRows =
    allProjectIds.length > 0
      ? await db
          .select()
          .from(projects)
          .where(
            sql`${projects.id} = ANY(ARRAY[${sql.join(
              allProjectIds.map((id) => sql`${id}`),
              sql`, `,
            )}]::int[])`,
          )
      : [];

  const results = [
    ...itemRows.map((i) => {
      const p = projectRows.find((pr) => pr.id === i.projectId);
      return {
        type: "item" as const,
        id: i.id,
        title: i.title,
        projectSlug: p?.slug ?? "",
        projectName: p?.name ?? "",
        snippet: i.description?.slice(0, 120) ?? null,
        number: i.number,
        itemType: i.type,
        status: i.status,
      };
    }),
    ...docRows.map((d) => {
      const p = projectRows.find((pr) => pr.id === d.projectId);
      return {
        type: "doc" as const,
        id: d.id,
        title: d.title,
        projectSlug: p?.slug ?? "",
        projectName: p?.name ?? "",
        snippet: d.body?.slice(0, 120) ?? null,
        number: null,
        itemType: null,
        status: null,
      };
    }),
  ];

  return res.json({ results, total: results.length });
});

export default router;
