import { Router } from "express";
import { sql, eq } from "drizzle-orm";
import { db } from "../lib/db";
import { items, docs, projects, projectMembers } from "../lib/schema";
import { requireAuth, AuthRequest } from "../lib/auth";

const router = Router();

// GET /search?q=...
// Uses Postgres full-text search (to_tsvector / to_tsquery) scoped to the
// caller's member projects.
router.get("/", requireAuth, async (req: AuthRequest, res) => {
  const q = String(req.query.q ?? "").trim();
  if (!q) return res.json({ results: [], total: 0 });

  // Build a Postgres plainto_tsquery (handles phrases, partial terms safely)
  const tsQuery = sql`plainto_tsquery('english', ${q})`;

  // Restrict to projects the user belongs to
  const memberRows = await db
    .select({ projectId: projectMembers.projectId })
    .from(projectMembers)
    .where(eq(projectMembers.userId, req.userId!));
  const projectIds = memberRows.map((r) => r.projectId);

  if (projectIds.length === 0) return res.json({ results: [], total: 0 });

  const projectIdArray = sql`ARRAY[${sql.join(
    projectIds.map((id) => sql`${id}`),
    sql`, `,
  )}]::int[]`;

  const [itemRows, docRows] = await Promise.all([
    db.execute<{
      id: number;
      project_id: number;
      number: number;
      type: string;
      title: string;
      description: string | null;
      status: string;
      rank: number;
    }>(sql`
      SELECT id, project_id, number, type, title, description, status,
             ts_rank(
               to_tsvector('english', coalesce(title,'') || ' ' || coalesce(description,'')),
               ${tsQuery}
             ) AS rank
      FROM items
      WHERE project_id = ANY(${projectIdArray})
        AND to_tsvector('english', coalesce(title,'') || ' ' || coalesce(description,''))
            @@ ${tsQuery}
      ORDER BY rank DESC
      LIMIT 20
    `),
    db.execute<{
      id: number;
      project_id: number;
      title: string;
      body: string;
      pinned: boolean;
      rank: number;
    }>(sql`
      SELECT id, project_id, title, body, pinned,
             ts_rank(
               to_tsvector('english', coalesce(title,'') || ' ' || coalesce(body,'')),
               ${tsQuery}
             ) AS rank
      FROM docs
      WHERE project_id = ANY(${projectIdArray})
        AND to_tsvector('english', coalesce(title,'') || ' ' || coalesce(body,''))
            @@ ${tsQuery}
      ORDER BY rank DESC
      LIMIT 20
    `),
  ]);

  const allProjectIds = [
    ...new Set([
      ...itemRows.rows.map((i) => i.project_id),
      ...docRows.rows.map((d) => d.project_id),
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
    ...itemRows.rows.map((i) => {
      const p = projectRows.find((pr) => pr.id === i.project_id);
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
        rank: i.rank,
      };
    }),
    ...docRows.rows.map((d) => {
      const p = projectRows.find((pr) => pr.id === d.project_id);
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
        rank: d.rank,
      };
    }),
  ].sort((a, b) => (b.rank as number) - (a.rank as number));

  return res.json({ results, total: results.length });
});

export default router;
