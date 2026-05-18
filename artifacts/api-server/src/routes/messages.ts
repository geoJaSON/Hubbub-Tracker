import { Router } from "express";
import { eq, desc, and, sql } from "drizzle-orm";
import { db, pool } from "../lib/db";
import { projects, messages, users, items } from "../lib/schema";
import { requireAuth, AuthRequest } from "../lib/auth";
import { logActivity } from "../lib/activity";
import { subscribeToProject, notifyProject } from "../lib/pgnotify";

const router = Router({ mergeParams: true });

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
        itemId: created.id,
        number: created.number,
        title: arg,
        type: cmd,
      });
      return { handled: true, reply: `✓ Created #${created.number}: ${arg}` };
    }

    case "close": {
      const rawNum = arg.replace(/^#/, "");
      const num = Number(rawNum);
      if (!num) return { handled: true, reply: "Usage: /close #<number>" };
      const [item] = await db
        .select()
        .from(items)
        .where(and(eq(items.projectId, projectId), eq(items.number, num)))
        .limit(1);
      if (!item) return { handled: true, reply: `Item #${num} not found` };
      await db
        .update(items)
        .set({ status: "done", closedAt: new Date() })
        .where(eq(items.id, item.id));
      await logActivity("item_status_changed", actorId, projectId, {
        itemId: item.id,
        number: item.number,
        from: item.status,
        to: "done",
      });
      return { handled: true, reply: `✓ Closed #${num}` };
    }

    case "assign": {
      const parts = arg.split(/\s+/);
      const rawNum = (parts[0] ?? "").replace(/^#/, "");
      const num = Number(rawNum);
      const username = (parts[1] ?? "").replace(/^@/, "");
      if (!num || !username)
        return { handled: true, reply: "Usage: /assign #<number> @<username>" };
      const [targetUser] = await db
        .select()
        .from(users)
        .where(eq(users.username, username))
        .limit(1);
      if (!targetUser)
        return { handled: true, reply: `User @${username} not found` };
      await db
        .update(items)
        .set({ assigneeId: targetUser.clerkId })
        .where(and(eq(items.projectId, projectId), eq(items.number, num)));
      await logActivity("item_assigned", actorId, projectId, {
        itemNumber: num,
        assigneeId: targetUser.clerkId,
      });
      return { handled: true, reply: `✓ Assigned #${num} to @${username}` };
    }

    default:
      return {
        handled: true,
        reply: `Unknown command: /${cmd}. Try /todo, /bug, /request, /decision, /close #N, /assign #N @user`,
      };
  }
}

// ── GET /projects/:slug/messages ─────────────────────────────────────────────
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

// ── GET /projects/:slug/messages/stream (SSE via pg LISTEN/NOTIFY) ────────────
router.get("/stream", requireAuth, async (req: AuthRequest, res) => {
  const slug = String(req.params.slug);
  const [project] = await db
    .select()
    .from(projects)
    .where(eq(projects.slug, slug))
    .limit(1);
  if (!project) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });

  const send = (data: unknown) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  send({ type: "connected" });

  let cleanup: (() => void) | null = null;

  subscribeToProject(project.id, (payload) => {
    send({ type: "message", message: payload });
  })
    .then((fn) => {
      cleanup = fn;
    })
    .catch((err) => {
      console.error("[SSE] subscribe error:", err);
    });

  const keepAlive = setInterval(() => {
    res.write(": ping\n\n");
  }, 15_000);

  req.on("close", () => {
    clearInterval(keepAlive);
    cleanup?.();
  });
});

// ── POST /projects/:slug/messages ────────────────────────────────────────────
router.post("/", requireAuth, async (req: AuthRequest, res) => {
  const slug = String(req.params.slug);
  const [project] = await db
    .select()
    .from(projects)
    .where(eq(projects.slug, slug))
    .limit(1);
  if (!project) return res.status(404).json({ error: "Not found" });

  const rawBody: string = req.body.body ?? "";
  const cmdResult = await processSlashCommand(rawBody, project.id, req.userId!);

  const [author] = await db
    .select()
    .from(users)
    .where(eq(users.clerkId, req.userId!))
    .limit(1);

  if (cmdResult.handled && cmdResult.reply) {
    const [cmdMsg] = await db
      .insert(messages)
      .values({ projectId: project.id, authorId: req.userId!, body: rawBody })
      .returning();
    const [sysMsg] = await db
      .insert(messages)
      .values({ projectId: project.id, authorId: "system", body: cmdResult.reply })
      .returning();

    const cmdFull = { ...cmdMsg, author: author ?? null };
    const sysFull = { ...sysMsg, author: null };

    await notifyProject(pool, project.id, cmdFull);
    await notifyProject(pool, project.id, sysFull);

    await logActivity("message_posted", req.userId!, project.id, {
      messageId: cmdMsg.id,
    });
    return res.status(201).json(cmdFull);
  }

  const [created] = await db
    .insert(messages)
    .values({ projectId: project.id, authorId: req.userId!, body: rawBody })
    .returning();

  await logActivity("message_posted", req.userId!, project.id, {
    messageId: created.id,
  });

  const msg = { ...created, author: author ?? null };
  await notifyProject(pool, project.id, msg);

  return res.status(201).json(msg);
});

export default router;
