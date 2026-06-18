import { Router } from "express";
import { eq, and, sql } from "drizzle-orm";
import { db } from "../lib/db";
import { projects, items, itemDependencies } from "../lib/schema";
import { requireAuth } from "../lib/auth";

const router = Router({ mergeParams: true });

async function resolveItem(slug: string, number: number) {
  const [project] = await db
    .select()
    .from(projects)
    .where(eq(projects.slug, slug))
    .limit(1);
  if (!project) return { project: null, item: null };
  const [item] = await db
    .select()
    .from(items)
    .where(and(eq(items.projectId, project.id), eq(items.number, number)))
    .limit(1);
  return { project, item: item ?? null };
}

// POST /projects/:slug/items/:itemNumber/dependencies  { dependsOnItemNumber }
router.post("/", requireAuth, async (req, res) => {
  const slug = String(req.params.slug);
  const itemNumber = Number(req.params.itemNumber);
  const dependsOnItemNumber = Number(req.body.dependsOnItemNumber);
  if (!Number.isInteger(dependsOnItemNumber)) {
    return res.status(400).json({ error: "dependsOnItemNumber required" });
  }
  if (dependsOnItemNumber === itemNumber) {
    return res.status(422).json({ error: "An item cannot depend on itself" });
  }

  const { project, item } = await resolveItem(slug, itemNumber);
  if (!project || !item) return res.status(404).json({ error: "Not found" });

  const [blocker] = await db
    .select()
    .from(items)
    .where(
      and(eq(items.projectId, project.id), eq(items.number, dependsOnItemNumber)),
    )
    .limit(1);
  if (!blocker) return res.status(404).json({ error: "Blocking item not found" });

  // Adding "item depends on blocker" is illegal if blocker can already reach
  // item through the dependency graph — that would close a cycle.
  const reachable = await db.execute(sql`
    WITH RECURSIVE reach AS (
      SELECT depends_on_item_id AS node
        FROM item_dependencies WHERE item_id = ${blocker.id}
      UNION
      SELECT d.depends_on_item_id
        FROM item_dependencies d JOIN reach r ON d.item_id = r.node
    )
    SELECT 1 FROM reach WHERE node = ${item.id} LIMIT 1
  `);
  if (reachable.rows.length > 0) {
    return res
      .status(409)
      .json({ error: "That dependency would create a cycle" });
  }

  await db
    .insert(itemDependencies)
    .values({ itemId: item.id, dependsOnItemId: blocker.id })
    .onConflictDoNothing();

  return res.status(201).json({ itemNumber, dependsOnItemNumber });
});

// DELETE /projects/:slug/items/:itemNumber/dependencies/:dependsOnItemNumber
router.delete("/:dependsOnItemNumber", requireAuth, async (req, res) => {
  const slug = String(req.params.slug);
  const itemNumber = Number(req.params.itemNumber);
  const dependsOnItemNumber = Number(req.params.dependsOnItemNumber);

  const { project, item } = await resolveItem(slug, itemNumber);
  if (!project || !item) return res.status(404).json({ error: "Not found" });

  const [blocker] = await db
    .select()
    .from(items)
    .where(
      and(eq(items.projectId, project.id), eq(items.number, dependsOnItemNumber)),
    )
    .limit(1);
  if (!blocker) return res.status(404).json({ error: "Not found" });

  await db
    .delete(itemDependencies)
    .where(
      and(
        eq(itemDependencies.itemId, item.id),
        eq(itemDependencies.dependsOnItemId, blocker.id),
      ),
    );
  return res.status(204).send();
});

export default router;
