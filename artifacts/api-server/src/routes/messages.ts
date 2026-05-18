import { Router } from "express";
import { eq, desc, and, sql } from "drizzle-orm";
import { db } from "../lib/db";
import { projects, messages, users, items } from "../lib/schema";
import { requireAuth, AuthRequest } from "../lib/auth";
import { logActivity } from "../lib/activity";

const router = Router({ mergeParams: true });

// ── SSE fanout registry ─────────────────────────────────────────────────────
type SSESender = (data: unknown) => void;
const sseClients = new Map<number, Set<SSESender>>();

export function broadcastToProject(projectId: number, data: unknown) {
  const clients = sseClients.get(projectId);
  if (!clients) return;
  for (const send of clients) {
    try { send(data); } catch { /* ignore disconnected */ }
  }
}

function addClient(projectId: number, fn: SSESender) {
  if (!sseClients.has(projectId)) sseClients.set(projectId, new Set());
  sseClients.get(projectId)!.add(fn);
}

function removeClient(projectId: number, fn: SSESender) {
  sseClients.get(projectId)?.delete(fn);
}

// ── Slash-command processor ─────────────────────────────────────────────────
async function processSlashCommand(
  body: string,
  projectId: number,
  actorId: string,
): Promise<{ handled: boolean; reply?: string }> {
  const trimmed = body.trim();
  if (!trimmed.startsWith("/")) return { handled: false };

  const [cmd, ...rest] = trimmed.slice(1).split(/\s+/);
  const arg = rest.join(" ");

  switch (cmd.toLowerCase()) {
    case "todo":
    case "bug":
    case "request":
    case "decision": {
      if (!arg) return { handled: true, reply: `Usage: /${cmd} <title>` };
      const [{ max }] = await db
        .select({ max: sql<number>`COALESCE(MAX(${items.number}), 0)` })
        .from(items)
        .where(eq(items.projectId, projectId));
      const [created] = await db
        .insert(items)
        .values({
          projectId,
          number: Number(max) + 1,
          type: cmd.toLowerCase() as "todo" | "bug" | "request" | "decision",
          title: arg,
          status: "open",
          priority: "medium",
        })
        .returning();
      await logActivity("item_created", actorId, projectId, {
        itemId: created.id, number: created.number, title: arg, type: cmd,
      });
      return { handled: true, reply: `✓ Created #${created.number}: ${arg}` };
    }
    case "close": {
      const num = Number(arg);
      if (!num) return { handled: true, reply: "Usage: /close <number>" };
      const [item] = await db
        .select()
        .from(items)
        .where(and(eq(items.projectId, projectId), eq(items.number, num)))
        .limit(1);
      if (!item) return { handled: true, reply: `Item #${num} not found` };
      await db.update(items).set({ status: "done", closedAt: new Date() }).where(eq(items.id, item.id));
      await logActivity("item_status_changed", actorId, projectId, {
        itemId: item.id, number: item.number, from: item.status, to: "done",
      });
      return { handled: true, reply: `✓ Closed #${num}` };
    }
    case "assign": {
      const parts = arg.split(/\s+/);
      const num = Number(parts[0]);
      const username = parts[1]?.replace(/^@/, "");
      if (!num || !username) return { handled: true, reply: "Usage: /assign <number> @username" };
      const [targetUser] = await db
        .select()
        .from(users)
        .where(eq(users.username, username))
        .limit(1);
      if (!targetUser) return { handled: true, reply: `User @${username} not found` };
      await db
        .update(items)
        .set({ assigneeId: targetUser.clerkId })
        .where(and(eq(items.projectId, projectId), eq(items.number, num)));
      await logActivity("item_assigned", actorId, projectId, {
        itemNumber: num, assigneeId: targetUser.clerkId,
      });
      return { handled: true, reply: `✓ Assigned #${num} to @${username}` };
    }
    default:
      return { handled: true, reply: `Unknown command: /${cmd}. Try /todo, /bug, /request, /decision, /close, /assign` };
  }
}

// ── GET /projects/:slug/messages ────────────────────────────────────────────
router.get("/", requireAuth, async (req, res) => {
  const [project] = await db
    .select()
    .from(projects)
    .where(eq(projects.slug, req.params.slug))
    .limit(1);
  if (!project) return res.status(404).json({ error: "Not found" });

  const rows = await db
    .select()
    .from(messages)
    .where(eq(messages.projectId, project.id))
    .orderBy(desc(messages.createdAt))
    .limit(100);

  rows.reverse();

  const authorIds = [...new Set(rows.map((m) => m.authorId))];
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

  return res.json(
    rows.map((m) => ({
      ...m,
      author: userRows.find((u) => u.clerkId === m.authorId) ?? null,
    })),
  );
});

// ── GET /projects/:slug/messages/stream  (SSE) ──────────────────────────────
router.get("/stream", requireAuth, async (req: AuthRequest, res) => {
  const [project] = await db
    .select()
    .from(projects)
    .where(eq(projects.slug, req.params.slug))
    .limit(1);
  if (!project) return res.status(404).json({ error: "Not found" });

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });

  const send: SSESender = (data) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  send({ type: "connected" });
  addClient(project.id, send);

  const keepAlive = setInterval(() => {
    res.write(": ping\n\n");
  }, 15_000);

  req.on("close", () => {
    clearInterval(keepAlive);
    removeClient(project.id, send);
  });
});

// ── POST /projects/:slug/messages ────────────────────────────────────────────
router.post("/", requireAuth, async (req: AuthRequest, res) => {
  const [project] = await db
    .select()
    .from(projects)
    .where(eq(projects.slug, req.params.slug))
    .limit(1);
  if (!project) return res.status(404).json({ error: "Not found" });

  const rawBody: string = req.body.body ?? "";

  // Handle slash commands: post as system reply, not a regular message
  const cmdResult = await processSlashCommand(rawBody, project.id, req.userId!);

  let payload: (typeof messages.$inferSelect & { author: (typeof users.$inferSelect) | null })[];

  if (cmdResult.handled && cmdResult.reply) {
    // Store the original command + system reply
    const [cmdMsg] = await db
      .insert(messages)
      .values({ projectId: project.id, authorId: req.userId!, body: rawBody })
      .returning();
    const [sysMsg] = await db
      .insert(messages)
      .values({
        projectId: project.id,
        authorId: "system",
        body: cmdResult.reply,
      })
      .returning();

    const [author] = await db.select().from(users).where(eq(users.clerkId, req.userId!)).limit(1);
    const msgs = [
      { ...cmdMsg, author: author ?? null },
      { ...sysMsg, author: null },
    ];
    for (const m of msgs) broadcastToProject(project.id, { type: "message", message: m });
    await logActivity("message_posted", req.userId!, project.id, { messageId: cmdMsg.id });
    return res.status(201).json(msgs[0]);
  }

  const [created] = await db
    .insert(messages)
    .values({ projectId: project.id, authorId: req.userId!, body: rawBody })
    .returning();

  await logActivity("message_posted", req.userId!, project.id, { messageId: created.id });

  const [author] = await db.select().from(users).where(eq(users.clerkId, req.userId!)).limit(1);
  const msg = { ...created, author: author ?? null };
  broadcastToProject(project.id, { type: "message", message: msg });

  return res.status(201).json(msg);
});

export default router;
