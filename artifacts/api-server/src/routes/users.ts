import { Router } from "express";
import { getAuth } from "@clerk/express";
import { eq } from "drizzle-orm";
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
    .where(eq(users.clerkId, req.params.userId))
    .returning();
  if (!updated) return res.status(404).json({ error: "Not found" });
  return res.json(updated);
});

// POST /users/sync — JIT provision a Clerk user
router.post("/sync", async (req, res) => {
  const auth = getAuth(req);
  const clerkId = auth?.userId;
  if (!clerkId) return res.status(401).json({ error: "Unauthorized" });

  const { email, displayName, avatarUrl } = req.body;

  const existing = await db
    .select()
    .from(users)
    .where(eq(users.clerkId, clerkId))
    .limit(1);

  if (existing.length > 0) {
    return res.json(existing[0]);
  }

  const isFirst = (await db.select().from(users).limit(1)).length === 0;

  const [created] = await db
    .insert(users)
    .values({
      clerkId,
      email: email ?? null,
      displayName: displayName ?? email ?? clerkId,
      avatarUrl: avatarUrl ?? null,
      role: isFirst ? "admin" : "member",
    })
    .returning();
  return res.status(201).json(created);
});

export default router;
