import { Router } from "express";
import { eq, count } from "drizzle-orm";
import { db } from "../lib/db";
import { users } from "../lib/schema";
import { requireAuth, requireAdmin, AuthRequest } from "../lib/auth";

const router = Router();

// GET /users/me
router.get("/me", requireAuth, async (req: AuthRequest, res) => {
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.clerkId, req.userId!))
    .limit(1);
  if (!user) return res.status(404).json({ error: "Not found" });
  const { passwordHash: _, ...rest } = user;
  return res.json(rest);
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
  const { passwordHash: _, ...rest } = updated;
  return res.json(rest);
});

// GET /users
router.get("/", requireAdmin, async (_req, res) => {
  const all = await db.select().from(users).orderBy(users.displayName);
  return res.json(all.map(({ passwordHash: _, ...u }) => u));
});

// POST /users — admin creates a user with no password (they set it via setup-password)
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
  const { passwordHash: _, ...rest } = created;
  return res.status(201).json(rest);
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
  const { passwordHash: _, ...rest } = updated;
  return res.json(rest);
});

// GET /users/setup — returns whether any users have been provisioned
router.get("/setup", async (_req, res) => {
  const [row] = await db.select({ id: users.id }).from(users).limit(1);
  return res.json({ initialized: !!row });
});

// POST /users/sync — kept for backwards compat but now a no-op identity check
// The JWT already proves identity; just return the current user record.
router.post("/sync", requireAuth, async (req: AuthRequest, res) => {
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.clerkId, req.userId!))
    .limit(1);
  if (!user) return res.status(404).json({ error: "User not found" });
  const { passwordHash: _, ...rest } = user;
  return res.json(rest);
});

export default router;
