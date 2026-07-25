// ── MCP endpoint ──────────────────────────────────────────────────────────────
// Exposes Hubbub as a Model Context Protocol server at POST /mcp (Streamable
// HTTP, stateless). Tool handlers do NOT touch the DB directly — they call this
// server's own /api routes on localhost, forwarding the caller's bearer token,
// so auth, project-membership checks, notifications, and activity logging all
// behave exactly as they do for any other API consumer.
//
// Tools are deliberately task-shaped (a dozen curated verbs, names accepted
// where the REST API wants IDs) rather than a 1:1 mirror of every endpoint —
// small tool sets with server-side name resolution work far better for models.
import { Router, type Request, type Response } from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { requireAuth } from "../lib/auth";
import { logger } from "../lib/logger";

// ── Self-fetch helper ─────────────────────────────────────────────────────────

class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

type Ctx = { baseUrl: string; token: string };

async function api<T>(
  ctx: Ctx,
  path: string,
  init?: { method?: string; body?: unknown },
): Promise<T> {
  const res = await fetch(`${ctx.baseUrl}${path}`, {
    method: init?.method ?? "GET",
    headers: {
      Authorization: `Bearer ${ctx.token}`,
      ...(init?.body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    ...(init?.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
  });
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  let json: unknown;
  try {
    json = text ? JSON.parse(text) : undefined;
  } catch {
    json = text;
  }
  if (!res.ok) {
    const msg =
      (json as { error?: string } | undefined)?.error ?? `HTTP ${res.status}`;
    throw new ApiError(res.status, `${init?.method ?? "GET"} ${path} failed: ${msg}`);
  }
  return json as T;
}

// ── Minimal shapes of API responses (only the fields the tools read) ──────────

type ApiUser = { clerkId?: string | null; displayName?: string; username?: string | null; email?: string | null };
type ApiMember = { userId: string; role: string; user: ApiUser | null };
type ApiScope = { id: number; name: string; slug: string; status: string };
type ApiMilestone = { id: number; scopeId: number; name: string; status: string; targetDate?: string | null };
type ApiComponent = { id: number; name: string; description?: string | null };
type ApiRelease = {
  id: number;
  componentId: number | null;
  component: ApiComponent | null;
  version: string;
  name: string | null;
  status: string;
  targetDate: string | null;
  releasedAt: string | null;
  changelog: string | null;
  itemCount: number;
  doneCount: number;
};
type ApiItem = {
  id: number;
  number: number;
  type: string;
  title: string;
  description?: string | null;
  status: string;
  priority: string;
  category?: string | null;
  assigneeId?: string | null;
  assignee?: ApiUser | null;
  scopeId?: number | null;
  milestoneId?: number | null;
  releaseId?: number | null;
  componentId?: number | null;
  component?: ApiComponent | null;
  dueDate?: string | null;
  estimateMinutes?: number | null;
  labels?: { id: number; name: string }[];
  isBlocked?: boolean;
  createdAt: string;
  closedAt?: string | null;
};
type ApiProject = {
  id: number;
  slug: string;
  name: string;
  description?: string | null;
  archived: boolean;
  members: ApiMember[];
  scopes: (ApiScope & { milestones: ApiMilestone[] })[];
  milestones: ApiMilestone[];
};

// ── Name → ID resolution ──────────────────────────────────────────────────────
// "none" (case-insensitive) is the documented sentinel for clearing a field.

const NONE = "none";
const isNone = (v: string) => v.trim().toLowerCase() === NONE;

function matchByName<T extends { name: string }>(rows: T[], name: string, kind: string): T {
  const q = name.trim().toLowerCase();
  const hit =
    rows.find((r) => r.name.toLowerCase() === q) ??
    rows.find((r) => r.name.toLowerCase().includes(q));
  if (!hit) {
    throw new ApiError(
      404,
      `No ${kind} matching "${name}". Available: ${rows.map((r) => r.name).join(", ") || "(none)"}`,
    );
  }
  return hit;
}

async function resolveComponentId(ctx: Ctx, slug: string, name: string): Promise<number | null> {
  if (isNone(name)) return null;
  const components = await api<ApiComponent[]>(ctx, `/projects/${slug}/components`);
  return matchByName(components, name, "component").id;
}

async function resolveRelease(ctx: Ctx, slug: string, version: string, componentName?: string): Promise<ApiRelease> {
  const releases = await api<ApiRelease[]>(ctx, `/projects/${slug}/releases`);
  const q = version.trim().toLowerCase();
  let hits = releases.filter(
    (r) => r.version.toLowerCase() === q || (r.name ?? "").toLowerCase() === q,
  );
  if (hits.length === 0) hits = releases.filter((r) => r.version.toLowerCase().includes(q));
  if (componentName) {
    const cq = componentName.trim().toLowerCase();
    hits = hits.filter((r) => (r.component?.name ?? "").toLowerCase().includes(cq));
  }
  if (hits.length === 0) {
    throw new ApiError(
      404,
      `No release matching "${version}". Available: ${releases.map((r) => `${r.version}${r.component ? ` [${r.component.name}]` : ""}`).join(", ") || "(none)"}`,
    );
  }
  if (hits.length > 1) {
    throw new ApiError(
      409,
      `Release "${version}" is ambiguous (${hits.map((r) => `${r.version}${r.component ? ` [${r.component.name}]` : ""}`).join(", ")}). Pass component_name to disambiguate.`,
    );
  }
  return hits[0];
}

async function resolveReleaseId(ctx: Ctx, slug: string, version: string, componentName?: string): Promise<number | null> {
  if (isNone(version)) return null;
  return (await resolveRelease(ctx, slug, version, componentName)).id;
}

async function resolveAssigneeId(ctx: Ctx, slug: string, who: string): Promise<string | null> {
  if (isNone(who)) return null;
  const members = await api<ApiMember[]>(ctx, `/projects/${slug}/members`);
  const q = who.trim().toLowerCase();
  const hit = members.find((m) => {
    const u = m.user;
    return (
      m.userId.toLowerCase() === q ||
      (u?.displayName ?? "").toLowerCase().includes(q) ||
      (u?.username ?? "").toLowerCase() === q ||
      (u?.email ?? "").toLowerCase() === q
    );
  });
  if (!hit) {
    throw new ApiError(
      404,
      `No project member matching "${who}". Members: ${members.map((m) => m.user?.displayName ?? m.userId).join(", ")}`,
    );
  }
  return hit.userId;
}

// ── Output trimming (keep tool results token-cheap) ───────────────────────────

function slimItem(i: ApiItem) {
  return {
    number: i.number,
    type: i.type,
    title: i.title,
    status: i.status,
    priority: i.priority,
    category: i.category ?? null,
    assignee: i.assignee?.displayName ?? null,
    component: i.component?.name ?? null,
    scopeId: i.scopeId ?? null,
    milestoneId: i.milestoneId ?? null,
    releaseId: i.releaseId ?? null,
    dueDate: i.dueDate ?? null,
    estimateMinutes: i.estimateMinutes ?? null,
    labels: (i.labels ?? []).map((l) => l.name),
    isBlocked: i.isBlocked ?? false,
  };
}

function slimRelease(r: ApiRelease) {
  return {
    version: r.version,
    name: r.name,
    platform: r.component?.name ?? null,
    status: r.status,
    targetDate: r.targetDate,
    releasedAt: r.releasedAt,
    progress: `${r.doneCount}/${r.itemCount} items done`,
    changelogNotes: r.changelog,
  };
}

function releaseChangelogMarkdown(r: ApiRelease, items: ApiItem[]): string {
  const done = items.filter((i) => i.releaseId === r.id && i.status === "done");
  const open = items.filter(
    (i) => i.releaseId === r.id && i.status !== "done" && i.status !== "cancelled",
  );
  const lines = [
    `## ${r.version}${r.name ? ` — ${r.name}` : ""}${r.component ? ` (${r.component.name})` : ""}`,
    ...(r.releasedAt ? [`Released: ${r.releasedAt}`] : r.targetDate ? [`Target: ${r.targetDate}`] : []),
    ...(r.changelog ? ["", r.changelog] : []),
    "",
    ...done.map((i) => `- ${i.title} (#${i.number})`),
  ];
  if (done.length === 0) lines.push("_No completed items yet._");
  if (open.length > 0) {
    lines.push("", `**Still open (${open.length}):**`, ...open.map((i) => `- ${i.title} (#${i.number}) — ${i.status}`));
  }
  return lines.join("\n");
}

// ── Server factory ────────────────────────────────────────────────────────────
// A fresh McpServer per request (stateless mode): cheap to build, and it lets
// each instance close over the caller's own bearer token.

const ITEM_ENUMS = {
  type: ["todo", "bug", "request", "decision"] as const,
  status: ["open", "in_progress", "on_hold", "blocked", "done", "cancelled"] as const,
  priority: ["low", "medium", "high", "urgent"] as const,
  releaseStatus: ["planned", "in_progress", "submitted", "released", "cancelled"] as const,
};

function buildServer(ctx: Ctx): McpServer {
  const server = new McpServer({ name: "hubbub", version: "1.0.0" });

  const text = (data: unknown) => ({
    content: [
      {
        type: "text" as const,
        text: typeof data === "string" ? data : JSON.stringify(data, null, 2),
      },
    ],
  });

  const fail = (err: unknown) => ({
    content: [
      {
        type: "text" as const,
        text: err instanceof Error ? err.message : String(err),
      },
    ],
    isError: true,
  });

  server.registerTool(
    "list_projects",
    {
      title: "List projects",
      description:
        "List Hubbub projects the caller can access. Returns each project's slug — the identifier every other tool needs.",
      inputSchema: {},
    },
    async () => {
      try {
        const projects = await api<{ slug: string; name: string; description?: string | null; archived: boolean }[]>(ctx, "/projects");
        return text(
          projects
            .filter((p) => !p.archived)
            .map((p) => ({ slug: p.slug, name: p.name, description: p.description ?? null })),
        );
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "get_project",
    {
      title: "Get project overview",
      description:
        "Full overview of one project: scopes, milestones, components (platforms), releases, and members. Call this once before creating or triaging items — it gives you every name you can reference.",
      inputSchema: { slug: z.string().describe("Project slug from list_projects") },
    },
    async ({ slug }) => {
      try {
        const [project, components, releases] = await Promise.all([
          api<ApiProject>(ctx, `/projects/${slug}`),
          api<ApiComponent[]>(ctx, `/projects/${slug}/components`),
          api<ApiRelease[]>(ctx, `/projects/${slug}/releases`),
        ]);
        return text({
          slug: project.slug,
          name: project.name,
          description: project.description ?? null,
          members: project.members.map((m) => ({ name: m.user?.displayName ?? m.userId, role: m.role })),
          components: components.map((c) => c.name),
          scopes: project.scopes.map((s) => ({
            name: s.name,
            status: s.status,
            milestones: s.milestones.map((m) => ({ name: m.name, status: m.status, targetDate: m.targetDate ?? null })),
          })),
          releases: releases.map(slimRelease),
        });
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "list_items",
    {
      title: "List / search items",
      description:
        "List a project's items (todos, bugs, requests, decisions) with optional filters. Closed items (done/cancelled) are excluded unless include_closed is true.",
      inputSchema: {
        slug: z.string(),
        status: z.enum(ITEM_ENUMS.status).optional(),
        type: z.enum(ITEM_ENUMS.type).optional(),
        search: z.string().optional().describe("Case-insensitive substring match on the title"),
        release_version: z.string().optional().describe("Only items assigned to this release version"),
        component_name: z.string().optional().describe("Only items for this component (e.g. Web, Mobile)"),
        include_closed: z.boolean().optional(),
      },
    },
    async ({ slug, status, type, search, release_version, component_name, include_closed }) => {
      try {
        const includeClosed = include_closed || status === "done" || status === "cancelled";
        let items = await api<ApiItem[]>(ctx, `/projects/${slug}/items?includeClosed=${includeClosed}`);
        if (status) items = items.filter((i) => i.status === status);
        if (type) items = items.filter((i) => i.type === type);
        if (search) {
          const q = search.toLowerCase();
          items = items.filter((i) => i.title.toLowerCase().includes(q));
        }
        if (release_version) {
          const releaseId = await resolveReleaseId(ctx, slug, release_version, component_name);
          items = items.filter((i) => (i.releaseId ?? null) === releaseId);
        }
        if (component_name && !release_version) {
          const componentId = await resolveComponentId(ctx, slug, component_name);
          items = items.filter((i) => (i.componentId ?? null) === componentId);
        }
        return text({ count: items.length, items: items.map(slimItem) });
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "get_item",
    {
      title: "Get item detail",
      description: "One item with description, comments, time logged, and linked commits.",
      inputSchema: { slug: z.string(), number: z.number().int().describe("Item number, e.g. 42 for #42") },
    },
    async ({ slug, number }) => {
      try {
        const item = await api<ApiItem & { comments?: { authorId: string; body: string; createdAt: string }[]; totalMinutesLogged?: number; commits?: { sha: string; message: string }[] }>(
          ctx,
          `/projects/${slug}/items/${number}`,
        );
        return text({
          ...slimItem(item),
          description: item.description ?? null,
          totalMinutesLogged: item.totalMinutesLogged ?? 0,
          comments: (item.comments ?? []).map((c) => ({ author: c.authorId, body: c.body, at: c.createdAt })),
          commits: (item.commits ?? []).map((c) => `${c.sha.slice(0, 7)} ${c.message}`),
        });
      } catch (e) {
        return fail(e);
      }
    },
  );

  const itemWriteShape = {
    title: z.string().optional(),
    description: z.string().optional(),
    type: z.enum(ITEM_ENUMS.type).optional(),
    status: z.enum(ITEM_ENUMS.status).optional(),
    priority: z.enum(ITEM_ENUMS.priority).optional(),
    component_name: z.string().optional().describe('Component/platform name, or "none" to clear'),
    release_version: z.string().optional().describe('Release version to assign (fix version), or "none" to clear'),
    assignee: z.string().optional().describe('Member name/username/email, or "none" to unassign'),
    due_date: z.string().optional().describe('YYYY-MM-DD, or "none" to clear'),
    estimate_minutes: z.number().int().optional(),
  };

  // Shared by create_item and update_item: turn name-based args into the
  // id-based patch the REST API expects. Only fields present in `args` appear
  // in the result, so PATCH semantics (omitted = unchanged) are preserved.
  async function buildItemPayload(slug: string, args: {
    title?: string; description?: string; type?: string; status?: string; priority?: string;
    component_name?: string; release_version?: string; assignee?: string; due_date?: string;
    estimate_minutes?: number;
  }): Promise<Record<string, unknown>> {
    const payload: Record<string, unknown> = {};
    if (args.title !== undefined) payload.title = args.title;
    if (args.description !== undefined) payload.description = args.description;
    if (args.type !== undefined) payload.type = args.type;
    if (args.status !== undefined) payload.status = args.status;
    if (args.priority !== undefined) payload.priority = args.priority;
    if (args.component_name !== undefined)
      payload.componentId = await resolveComponentId(ctx, slug, args.component_name);
    if (args.release_version !== undefined)
      payload.releaseId = await resolveReleaseId(ctx, slug, args.release_version, args.component_name);
    if (args.assignee !== undefined)
      payload.assigneeId = await resolveAssigneeId(ctx, slug, args.assignee);
    if (args.due_date !== undefined)
      payload.dueDate = isNone(args.due_date) ? null : args.due_date;
    if (args.estimate_minutes !== undefined) payload.estimateMinutes = args.estimate_minutes;
    return payload;
  }

  server.registerTool(
    "create_item",
    {
      title: "Create item",
      description:
        "Create a todo, bug, request, or decision in a project. Component, release, and assignee are referenced by NAME (resolved server-side) — call get_project first to see what exists.",
      inputSchema: {
        slug: z.string(),
        ...itemWriteShape,
        type: z.enum(ITEM_ENUMS.type),
        title: z.string(),
      },
    },
    async ({ slug, ...args }) => {
      try {
        const payload = await buildItemPayload(slug, args);
        const created = await api<ApiItem>(ctx, `/projects/${slug}/items`, { method: "POST", body: payload });
        return text({ created: slimItem(created), url: `/projects/${slug}/items/${created.number}` });
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "update_item",
    {
      title: "Update item",
      description:
        'Update fields on an item by its number. Only the fields you pass change. Use release_version to triage a bug into a release ("fix version"); pass "none" to clear a field.',
      inputSchema: {
        slug: z.string(),
        number: z.number().int(),
        ...itemWriteShape,
      },
    },
    async ({ slug, number, ...args }) => {
      try {
        const payload = await buildItemPayload(slug, args);
        if (Object.keys(payload).length === 0) return fail(new Error("Pass at least one field to change."));
        const updated = await api<ApiItem>(ctx, `/projects/${slug}/items/${number}`, { method: "PATCH", body: payload });
        return text({ updated: slimItem(updated) });
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "list_releases",
    {
      title: "List releases",
      description:
        "List a project's releases (ship vehicles / fix versions) with status, dates, and item progress. Platform = the component the release ships for (null = whole app).",
      inputSchema: { slug: z.string() },
    },
    async ({ slug }) => {
      try {
        const releases = await api<ApiRelease[]>(ctx, `/projects/${slug}/releases`);
        return text(releases.map(slimRelease));
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "create_release",
    {
      title: "Create release",
      description:
        "Plan a new release. version is required (e.g. \"1.4.0\"); component_name sets the platform (e.g. Web, Mobile — omit for a whole-app release).",
      inputSchema: {
        slug: z.string(),
        version: z.string(),
        name: z.string().optional().describe("Optional codename"),
        component_name: z.string().optional(),
        status: z.enum(ITEM_ENUMS.releaseStatus).optional().describe("Defaults to planned"),
        target_date: z.string().optional().describe("YYYY-MM-DD"),
        changelog: z.string().optional().describe("Notes shown above the auto-generated changelog"),
      },
    },
    async ({ slug, version, name, component_name, status, target_date, changelog }) => {
      try {
        const created = await api<ApiRelease>(ctx, `/projects/${slug}/releases`, {
          method: "POST",
          body: {
            version,
            name: name ?? null,
            componentId: component_name ? await resolveComponentId(ctx, slug, component_name) : null,
            status: status ?? "planned",
            targetDate: target_date ?? null,
            changelog: changelog ?? null,
          },
        });
        return text({ created: slimRelease(created) });
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "update_release",
    {
      title: "Update / ship release",
      description:
        'Update a release located by its version string. Setting status to "released" ships it (releasedAt is stamped automatically). Pass component_name if two platforms share a version number.',
      inputSchema: {
        slug: z.string(),
        version: z.string().describe("Version of the release to update"),
        component_name: z.string().optional().describe("Disambiguates when Web and Mobile share a version"),
        new_version: z.string().optional(),
        name: z.string().optional(),
        status: z.enum(ITEM_ENUMS.releaseStatus).optional(),
        target_date: z.string().optional().describe('YYYY-MM-DD, or "none" to clear'),
        changelog: z.string().optional(),
      },
    },
    async ({ slug, version, component_name, new_version, name, status, target_date, changelog }) => {
      try {
        const release = await resolveRelease(ctx, slug, version, component_name);
        const patch: Record<string, unknown> = {};
        if (new_version !== undefined) patch.version = new_version;
        if (name !== undefined) patch.name = name;
        if (status !== undefined) patch.status = status;
        if (target_date !== undefined) patch.targetDate = isNone(target_date) ? null : target_date;
        if (changelog !== undefined) patch.changelog = changelog;
        if (Object.keys(patch).length === 0) return fail(new Error("Pass at least one field to change."));
        const updated = await api<ApiRelease>(ctx, `/projects/${slug}/releases/${release.id}`, { method: "PATCH", body: patch });
        return text({ updated: slimRelease(updated) });
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "release_changelog",
    {
      title: "Release changelog",
      description:
        "Markdown changelog for a release: the release's own notes followed by its completed items, plus a list of anything still open.",
      inputSchema: {
        slug: z.string(),
        version: z.string(),
        component_name: z.string().optional(),
      },
    },
    async ({ slug, version, component_name }) => {
      try {
        const release = await resolveRelease(ctx, slug, version, component_name);
        const items = await api<ApiItem[]>(ctx, `/projects/${slug}/items?includeClosed=true`);
        return text(releaseChangelogMarkdown(release, items));
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "post_message",
    {
      title: "Post chat message",
      description: "Post a message to the project's team chat (e.g. a summary of triage you just did).",
      inputSchema: { slug: z.string(), body: z.string() },
    },
    async ({ slug, body }) => {
      try {
        await api(ctx, `/projects/${slug}/messages`, { method: "POST", body: { body } });
        return text("Message posted.");
      } catch (e) {
        return fail(e);
      }
    },
  );

  server.registerTool(
    "log_time",
    {
      title: "Log time on item",
      description: "Log work time (in minutes) against an item, dated today.",
      inputSchema: {
        slug: z.string(),
        number: z.number().int().describe("Item number"),
        minutes: z.number().int().positive(),
        note: z.string().optional(),
      },
    },
    async ({ slug, number, minutes, note }) => {
      try {
        await api(ctx, `/projects/${slug}/items/${number}/time`, {
          method: "POST",
          body: {
            minutes,
            note: note ?? null,
            billable: true,
            spentOn: new Date().toISOString().slice(0, 10),
          },
        });
        return text(`Logged ${minutes}m on #${number}.`);
      } catch (e) {
        return fail(e);
      }
    },
  );

  return server;
}

// ── Express wiring ────────────────────────────────────────────────────────────
// Stateless Streamable HTTP: every POST carries a complete JSON-RPC message and
// gets a fresh server + transport pair. No sessions to manage, safe behind
// Traefik, and horizontal-scaling friendly.

const router: ReturnType<typeof Router> = Router();

router.post("/", requireAuth, async (req: Request, res: Response) => {
  const token = (req.headers.authorization ?? "").replace(/^Bearer /, "");
  // Call our own API on the port this very request arrived on.
  const baseUrl = `http://127.0.0.1:${req.socket.localPort}/api`;

  const server = buildServer({ baseUrl, token });
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined, // stateless
    enableJsonResponse: true,
  });
  res.on("close", () => {
    void transport.close();
    void server.close();
  });

  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    logger.error({ err }, "MCP request failed");
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: { code: -32603, message: "Internal server error" },
        id: null,
      });
    }
  }
});

// Stateless mode has no SSE stream to resume and no session to delete.
const methodNotAllowed = (_req: Request, res: Response) => {
  res.status(405).json({
    jsonrpc: "2.0",
    error: { code: -32000, message: "Method not allowed: this MCP server is stateless (POST only)" },
    id: null,
  });
};
router.get("/", methodNotAllowed);
router.delete("/", methodNotAllowed);

export default router;
