import { Router } from "express";
import { eq } from "drizzle-orm";
import { db } from "../lib/db";
import { users } from "../lib/schema";
import { requireAuth, requireAdmin, AuthRequest } from "../lib/auth";

const router = Router();

// Strip the password hash and expose a derived `pending` flag: a user is
// "pending sign-in" until they set a password (claim an admin-invited record or
// register). This replaces the old, brittle `clerkId.startsWith("manual_")`
// heuristic, which never cleared after a user claimed their account.
function toPublic(user: typeof users.$inferSelect) {
  const { passwordHash, ...rest } = user;
  return { ...rest, pending: !passwordHash };
}

// GET /users/me
router.get("/me", requireAuth, async (req: AuthRequest, res) => {
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.clerkId, req.userId!))
    .limit(1);
  if (!user) return res.status(404).json({ error: "Not found" });
  return res.json(toPublic(user));
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
  return res.json(toPublic(updated));
});

// GET /users
router.get("/", requireAdmin, async (_req, res) => {
  const all = await db.select().from(users).orderBy(users.displayName);
  return res.json(all.map(toPublic));
});

// POST /users — admin creates a user with no password. The person later claims
// the record by registering with the same email (see /auth/register), or the
// operator sets an initial password via /auth/setup-password.
router.post("/", requireAdmin, async (req, res) => {
  const { email, displayName, username, role, hourlyRateCents } = req.body;
  const localId = `manual_${Date.now()}`;
  const [created] = await db
    .insert(users)
    .values({
      clerkId: localId,
      email: email ? String(email).toLowerCase() : null,
      displayName,
      username,
      role: role ?? "member",
      hourlyRateCents,
    })
    .returning();
  return res.status(201).json(toPublic(created));
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
  return res.json(toPublic(updated));
});

// GET /users/setup — returns whether any users have been provisioned
router.get("/setup", async (_req, res) => {
  const [row] = await db.select({ id: users.id }).from(users).limit(1);
  return res.json({ initialized: !!row });
});

// POST /users/sync — kept for backwards compat but now a no-op identity check.
// The JWT already proves identity; just return the current user record.
router.post("/sync", requireAuth, async (req: AuthRequest, res) => {
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.clerkId, req.userId!))
    .limit(1);
  if (!user) return res.status(404).json({ error: "User not found" });
  return res.json(toPublic(user));
});

export default router;
