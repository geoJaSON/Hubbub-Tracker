import { Router } from "express";
import { getAuth } from "@clerk/express";
import { eq, and, sql } from "drizzle-orm";
import { db } from "../lib/db";
import { users, projectMembers, timeEntries, presence, standupCache } from "../lib/schema";
import { requireAuth, requireAdmin, AuthRequest } from "../lib/auth";
import { count } from "drizzle-orm";

const router = Router();

// GET /users/me
router.get("/me", requireAuth, async (req: AuthRequest, res) => {
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.clerkId, req.userId!))
    .limit(1);
  if (!user) return res.status(404).json({ error: "Not found" });
  return res.json(user);
});

// PATCH /users/me
router.patch("/me", requireAuth, async (req: AuthRequest, res) => {
  const { displayName, avatarUrl, username } = req.body;
  const [updated] = await db
    .update(users)
    .set({
      ...(displayName !== undefined && { displayName }),
      ...(avatarUrl !== undefined && { avatarUrl }),
      ...(username !== undefined && { username }),
    })
    .where(eq(users.clerkId, req.userId!))
    .returning();
  return res.json(updated);
});

// GET /users
router.get("/", requireAdmin, async (_req, res) => {
  const all = await db.select().from(users).orderBy(users.displayName);
  return res.json(all);
});

// POST /users
router.post("/", requireAdmin, async (req, res) => {
  const { email, displayName, username, role, hourlyRateCents } = req.body;
  const [created] = await db
    .insert(users)
    .values({
      clerkId: `manual_${Date.now()}`,
      email,
      displayName,
      username,
      role: role ?? "member",
      hourlyRateCents,
    })
    .returning();
  return res.status(201).json(created);
});

// PATCH /users/:userId
router.patch("/:userId", requireAdmin, async (req, res) => {
  const { displayName, role, hourlyRateCents, active } = req.body;
  const [updated] = await db
    .update(users)
    .set({
      ...(displayName !== undefined && { displayName }),
      ...(role !== undefined && { role }),
      ...(hourlyRateCents !== undefined && { hourlyRateCents }),
      ...(active !== undefined && { active }),
    })
    .where(eq(users.clerkId, String(req.params.userId)))
    .returning();
  if (!updated) return res.status(404).json({ error: "Not found" });
  return res.json(updated);
});

// GET /auth/setup — returns whether at least one user has been provisioned
router.get("/setup", async (_req, res) => {
  const [row] = await db.select({ id: users.id }).from(users).limit(1);
  return res.json({ initialized: !!row });
});

const ALLOWED_DOMAIN = "372geomedia.com";

// POST /users/sync — JIT provision a Clerk user
router.post("/sync", async (req, res) => {
  const auth = getAuth(req);
  const clerkId = auth?.userId;
  if (!clerkId) return res.status(401).json({ error: "Unauthorized" });

  const { email, displayName, avatarUrl } = req.body;

  // Domain allowlist: only @372geomedia.com addresses may register
  if (!email || !email.toLowerCase().endsWith(`@${ALLOWED_DOMAIN}`)) {
    return res.status(403).json({
      error: "access_denied",
      message: `Only @${ALLOWED_DOMAIN} accounts are permitted.`,
    });
  }

  // Check for existing row by clerkId
  const existing = await db
    .select()
    .from(users)
    .where(eq(users.clerkId, clerkId))
    .limit(1);

  if (existing.length > 0) {
    // If this user exists but no admins exist at all, promote them to break
    // the chicken-and-egg deadlock (can happen if first user was created as member)
    if (existing[0].role !== "admin") {
      const [adminCount] = await db
        .select({ count: count() })
        .from(users)
        .where(eq(users.role, "admin"));
      if ((adminCount?.count ?? 0) === 0) {
        const [promoted] = await db
          .update(users)
          .set({ role: "admin" })
          .where(eq(users.clerkId, clerkId))
          .returning();
        return res.json(promoted);
      }
    }
    return res.json(existing[0]);
  }

  // Check for a pending admin-created record with a matching email (manual_ clerkId)
  if (email) {
    const [pending] = await db
      .select()
      .from(users)
      .where(
        and(
          eq(users.email, email),
          sql`${users.clerkId} LIKE 'manual_%'`,
        ),
      )
      .limit(1);

    if (pending) {
      const oldId = pending.clerkId;
      // Cascade the ID rename to all tables that store userId as a Clerk ID string
      await Promise.all([
        db.update(projectMembers).set({ userId: clerkId }).where(eq(projectMembers.userId, oldId)),
        db.update(timeEntries).set({ userId: clerkId }).where(eq(timeEntries.userId, oldId)),
        db.update(presence).set({ userId: clerkId }).where(eq(presence.userId, oldId)),
        db.update(standupCache).set({ userId: clerkId }).where(eq(standupCache.userId, oldId)),
      ]);
      // Claim the pending record by overwriting the synthetic clerkId
      const [claimed] = await db
        .update(users)
        .set({ clerkId, avatarUrl: avatarUrl ?? pending.avatarUrl })
        .where(eq(users.id, pending.id))
        .returning();
      return res.json(claimed);
    }
  }

  // Assign admin if no admins exist yet (prevents first-user deadlock)
  const [adminCount] = await db
    .select({ count: count() })
    .from(users)
    .where(eq(users.role, "admin"));
  const noAdmins = (adminCount?.count ?? 0) === 0;

  const [created] = await db
    .insert(users)
    .values({
      clerkId,
      email: email ?? null,
      displayName: displayName ?? email ?? clerkId,
      avatarUrl: avatarUrl ?? null,
      role: noAdmins ? "admin" : "member",
    })
    .returning();
  return res.status(201).json(created);
});

export default router;
