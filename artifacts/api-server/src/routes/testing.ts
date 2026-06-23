import { Router } from "express";
import { eq, and, inArray, asc, desc, sql } from "drizzle-orm";
import { db } from "../lib/db";
import { projects, testSuites, testCases, testRuns } from "../lib/schema";
import { requireAuth, AuthRequest } from "../lib/auth";

// Mounted at /projects/:slug/testing behind the project-membership guard.
const router = Router({ mergeParams: true });

const RESULTS = ["pass", "fail", "skip", "blocked"] as const;
type RunResult = (typeof RESULTS)[number];
const isResult = (v: unknown): v is RunResult =>
  typeof v === "string" && (RESULTS as readonly string[]).includes(v);

async function getProject(slug: string) {
  const [p] = await db
    .select()
    .from(projects)
    .where(eq(projects.slug, slug))
    .limit(1);
  return p ?? null;
}

// Verify a suite belongs to the project; returns the suite or null.
async function suiteInProject(suiteId: number, projectId: number) {
  const [s] = await db
    .select()
    .from(testSuites)
    .where(and(eq(testSuites.id, suiteId), eq(testSuites.projectId, projectId)))
    .limit(1);
  return s ?? null;
}

// Verify a case belongs to the project (via its suite); returns the case or null.
async function caseInProject(caseId: number, projectId: number) {
  const [row] = await db
    .select({ tc: testCases })
    .from(testCases)
    .innerJoin(testSuites, eq(testCases.suiteId, testSuites.id))
    .where(and(eq(testCases.id, caseId), eq(testSuites.projectId, projectId)))
    .limit(1);
  return row?.tc ?? null;
}

// Verify a run belongs to the project (via case → suite); returns the run or null.
async function runInProject(runId: number, projectId: number) {
  const [row] = await db
    .select({ tr: testRuns })
    .from(testRuns)
    .innerJoin(testCases, eq(testRuns.caseId, testCases.id))
    .innerJoin(testSuites, eq(testCases.suiteId, testSuites.id))
    .where(and(eq(testRuns.id, runId), eq(testSuites.projectId, projectId)))
    .limit(1);
  return row?.tr ?? null;
}

async function nextSuiteOrder(projectId: number): Promise<number> {
  const [r] = await db
    .select({ max: sql<number>`coalesce(max(${testSuites.order}), -1)` })
    .from(testSuites)
    .where(eq(testSuites.projectId, projectId));
  return (r?.max ?? -1) + 1;
}

async function nextCaseOrder(suiteId: number): Promise<number> {
  const [r] = await db
    .select({ max: sql<number>`coalesce(max(${testCases.order}), -1)` })
    .from(testCases)
    .where(eq(testCases.suiteId, suiteId));
  return (r?.max ?? -1) + 1;
}

// ── GET /projects/:slug/testing ───────────────────────────────────────────────
// The full plan: suites → cases → runs, with each case's derived current status,
// last-tested timestamp, and distinct device list.
router.get("/", requireAuth, async (req, res) => {
  const project = await getProject(String(req.params.slug));
  if (!project) return res.status(404).json({ error: "Not found" });

  const suites = await db
    .select()
    .from(testSuites)
    .where(eq(testSuites.projectId, project.id))
    .orderBy(asc(testSuites.order), asc(testSuites.id));

  const suiteIds = suites.map((s) => s.id);
  const cases = suiteIds.length
    ? await db
        .select()
        .from(testCases)
        .where(inArray(testCases.suiteId, suiteIds))
        .orderBy(asc(testCases.order), asc(testCases.id))
    : [];

  const caseIds = cases.map((c) => c.id);
  const runs = caseIds.length
    ? await db
        .select()
        .from(testRuns)
        .where(inArray(testRuns.caseId, caseIds))
        .orderBy(desc(testRuns.testedAt), desc(testRuns.id))
    : [];

  const runsByCase = new Map<number, typeof runs>();
  for (const r of runs) {
    const list = runsByCase.get(r.caseId);
    if (list) list.push(r);
    else runsByCase.set(r.caseId, [r]);
  }

  const casesBySuite = new Map<number, typeof cases>();
  for (const c of cases) {
    const list = casesBySuite.get(c.suiteId);
    if (list) list.push(c);
    else casesBySuite.set(c.suiteId, [c]);
  }

  const plan = suites.map((s) => ({
    ...s,
    cases: (casesBySuite.get(s.id) ?? []).map((c) => {
      const caseRuns = runsByCase.get(c.id) ?? []; // already sorted newest-first
      const latest = caseRuns[0] ?? null;
      const devices = [
        ...new Set(
          caseRuns
            .map((r) => (r.device ?? "").trim())
            .filter((d) => d.length > 0),
        ),
      ];
      return {
        ...c,
        runs: caseRuns,
        currentStatus: latest ? latest.result : "untested",
        lastTestedAt: latest ? latest.testedAt : null,
        devices,
      };
    }),
  }));

  return res.json({ suites: plan });
});

// ── POST /projects/:slug/testing/import ───────────────────────────────────────
// Bulk-create suites and their cases (appended after any existing suites).
// Body: { suites: [{ code?, title, warn?, cases: [{ code?, title, expected?, owner? }] }] }
router.post("/import", requireAuth, async (req, res) => {
  const project = await getProject(String(req.params.slug));
  if (!project) return res.status(404).json({ error: "Not found" });

  const body = req.body as {
    suites?: Array<{
      code?: string;
      title?: string;
      warn?: boolean;
      cases?: Array<{ code?: string; title?: string; expected?: string; owner?: string }>;
    }>;
  };
  if (!Array.isArray(body.suites) || body.suites.length === 0) {
    return res.status(400).json({ error: "suites array is required" });
  }

  let base = await nextSuiteOrder(project.id);
  let created = 0;

  await db.transaction(async (tx) => {
    for (const suite of body.suites!) {
      if (!suite.title?.trim()) continue;
      const [s] = await tx
        .insert(testSuites)
        .values({
          projectId: project.id,
          code: suite.code?.trim() || null,
          title: suite.title.trim(),
          warn: Boolean(suite.warn),
          order: base++,
        })
        .returning();
      const rows = (suite.cases ?? [])
        .filter((c) => c.title?.trim())
        .map((c, i) => ({
          suiteId: s.id,
          code: c.code?.trim() || null,
          title: c.title!.trim(),
          expected: c.expected?.trim() || null,
          owner: c.owner?.trim() || null,
          order: i,
        }));
      if (rows.length) {
        await tx.insert(testCases).values(rows);
        created += rows.length;
      }
    }
  });

  return res.status(201).json({ ok: true, suites: body.suites.length, cases: created });
});

// ── Suites ────────────────────────────────────────────────────────────────────
// POST /projects/:slug/testing/suites
router.post("/suites", requireAuth, async (req, res) => {
  const project = await getProject(String(req.params.slug));
  if (!project) return res.status(404).json({ error: "Not found" });

  const { title, code, warn } = req.body as { title?: string; code?: string; warn?: boolean };
  if (!title?.trim()) return res.status(400).json({ error: "title is required" });

  const [created] = await db
    .insert(testSuites)
    .values({
      projectId: project.id,
      title: title.trim(),
      code: code?.trim() || null,
      warn: Boolean(warn),
      order: await nextSuiteOrder(project.id),
    })
    .returning();

  return res.status(201).json(created);
});

// PATCH /projects/:slug/testing/suites/:suiteId
router.patch("/suites/:suiteId", requireAuth, async (req, res) => {
  const project = await getProject(String(req.params.slug));
  if (!project) return res.status(404).json({ error: "Not found" });
  const existing = await suiteInProject(Number(req.params.suiteId), project.id);
  if (!existing) return res.status(404).json({ error: "Not found" });

  const { title, code, warn, order } = req.body as {
    title?: string;
    code?: string;
    warn?: boolean;
    order?: number;
  };

  const [updated] = await db
    .update(testSuites)
    .set({
      ...(title !== undefined && { title: String(title).trim() }),
      ...(code !== undefined && { code: code?.trim() || null }),
      ...(warn !== undefined && { warn: Boolean(warn) }),
      ...(order !== undefined && { order: Number(order) }),
    })
    .where(eq(testSuites.id, existing.id))
    .returning();

  return res.json(updated);
});

// DELETE /projects/:slug/testing/suites/:suiteId  (cascades to cases + runs)
router.delete("/suites/:suiteId", requireAuth, async (req, res) => {
  const project = await getProject(String(req.params.slug));
  if (!project) return res.status(404).json({ error: "Not found" });
  const existing = await suiteInProject(Number(req.params.suiteId), project.id);
  if (!existing) return res.status(404).json({ error: "Not found" });

  await db.delete(testSuites).where(eq(testSuites.id, existing.id));
  return res.status(204).send();
});

// ── Cases ─────────────────────────────────────────────────────────────────────
// POST /projects/:slug/testing/suites/:suiteId/cases
router.post("/suites/:suiteId/cases", requireAuth, async (req, res) => {
  const project = await getProject(String(req.params.slug));
  if (!project) return res.status(404).json({ error: "Not found" });
  const suite = await suiteInProject(Number(req.params.suiteId), project.id);
  if (!suite) return res.status(404).json({ error: "Not found" });

  const { title, code, expected, owner } = req.body as {
    title?: string;
    code?: string;
    expected?: string;
    owner?: string;
  };
  if (!title?.trim()) return res.status(400).json({ error: "title is required" });

  const [created] = await db
    .insert(testCases)
    .values({
      suiteId: suite.id,
      title: title.trim(),
      code: code?.trim() || null,
      expected: expected?.trim() || null,
      owner: owner?.trim() || null,
      order: await nextCaseOrder(suite.id),
    })
    .returning();

  return res.status(201).json(created);
});

// PATCH /projects/:slug/testing/cases/:caseId
router.patch("/cases/:caseId", requireAuth, async (req, res) => {
  const project = await getProject(String(req.params.slug));
  if (!project) return res.status(404).json({ error: "Not found" });
  const existing = await caseInProject(Number(req.params.caseId), project.id);
  if (!existing) return res.status(404).json({ error: "Not found" });

  const { title, code, expected, owner, order, suiteId } = req.body as {
    title?: string;
    code?: string;
    expected?: string;
    owner?: string;
    order?: number;
    suiteId?: number;
  };

  // Moving to another suite is only allowed within the same project.
  if (suiteId !== undefined) {
    const dest = await suiteInProject(Number(suiteId), project.id);
    if (!dest) return res.status(400).json({ error: "Invalid suiteId" });
  }

  const [updated] = await db
    .update(testCases)
    .set({
      ...(title !== undefined && { title: String(title).trim() }),
      ...(code !== undefined && { code: code?.trim() || null }),
      ...(expected !== undefined && { expected: expected?.trim() || null }),
      ...(owner !== undefined && { owner: owner?.trim() || null }),
      ...(order !== undefined && { order: Number(order) }),
      ...(suiteId !== undefined && { suiteId: Number(suiteId) }),
      updatedAt: new Date(),
    })
    .where(eq(testCases.id, existing.id))
    .returning();

  return res.json(updated);
});

// DELETE /projects/:slug/testing/cases/:caseId  (cascades to runs)
router.delete("/cases/:caseId", requireAuth, async (req, res) => {
  const project = await getProject(String(req.params.slug));
  if (!project) return res.status(404).json({ error: "Not found" });
  const existing = await caseInProject(Number(req.params.caseId), project.id);
  if (!existing) return res.status(404).json({ error: "Not found" });

  await db.delete(testCases).where(eq(testCases.id, existing.id));
  return res.status(204).send();
});

// ── Runs ──────────────────────────────────────────────────────────────────────
// POST /projects/:slug/testing/cases/:caseId/runs
router.post("/cases/:caseId/runs", requireAuth, async (req: AuthRequest, res) => {
  const project = await getProject(String(req.params.slug));
  if (!project) return res.status(404).json({ error: "Not found" });
  const tc = await caseInProject(Number(req.params.caseId), project.id);
  if (!tc) return res.status(404).json({ error: "Not found" });

  const { result, device, note, testedAt } = req.body as {
    result?: string;
    device?: string;
    note?: string;
    testedAt?: string;
  };
  if (!isResult(result)) {
    return res.status(400).json({ error: "result must be one of pass|fail|skip|blocked" });
  }

  let when: Date | undefined;
  if (testedAt !== undefined) {
    const d = new Date(testedAt);
    if (Number.isNaN(d.getTime())) return res.status(400).json({ error: "Invalid testedAt" });
    when = d;
  }

  const [created] = await db
    .insert(testRuns)
    .values({
      caseId: tc.id,
      result,
      device: device?.trim() || null,
      note: note?.trim() || null,
      createdById: req.userId ?? null,
      ...(when && { testedAt: when }),
    })
    .returning();

  // Touch the case so its updatedAt reflects the latest activity.
  await db
    .update(testCases)
    .set({ updatedAt: new Date() })
    .where(eq(testCases.id, tc.id));

  return res.status(201).json(created);
});

// PATCH /projects/:slug/testing/runs/:runId
router.patch("/runs/:runId", requireAuth, async (req, res) => {
  const project = await getProject(String(req.params.slug));
  if (!project) return res.status(404).json({ error: "Not found" });
  const existing = await runInProject(Number(req.params.runId), project.id);
  if (!existing) return res.status(404).json({ error: "Not found" });

  const { result, device, note, testedAt } = req.body as {
    result?: string;
    device?: string;
    note?: string;
    testedAt?: string;
  };
  if (result !== undefined && !isResult(result)) {
    return res.status(400).json({ error: "result must be one of pass|fail|skip|blocked" });
  }

  let when: Date | undefined;
  if (testedAt !== undefined) {
    const d = new Date(testedAt);
    if (Number.isNaN(d.getTime())) return res.status(400).json({ error: "Invalid testedAt" });
    when = d;
  }

  const [updated] = await db
    .update(testRuns)
    .set({
      ...(result !== undefined && { result: result as RunResult }),
      ...(device !== undefined && { device: device?.trim() || null }),
      ...(note !== undefined && { note: note?.trim() || null }),
      ...(when && { testedAt: when }),
    })
    .where(eq(testRuns.id, existing.id))
    .returning();

  return res.json(updated);
});

// DELETE /projects/:slug/testing/runs/:runId
router.delete("/runs/:runId", requireAuth, async (req, res) => {
  const project = await getProject(String(req.params.slug));
  if (!project) return res.status(404).json({ error: "Not found" });
  const existing = await runInProject(Number(req.params.runId), project.id);
  if (!existing) return res.status(404).json({ error: "Not found" });

  await db.delete(testRuns).where(eq(testRuns.id, existing.id));
  return res.status(204).send();
});

export default router;
