import { Router } from "express";
import { desc, eq } from "drizzle-orm";
import { db } from "../lib/db";
import { apiKeys } from "../lib/schema";
import { requireAuth, AuthRequest } from "../lib/auth";
import { generateApiKey } from "../lib/crypto";

const router = Router();

// API-key management. Every route requires a real session (requireAuth also
// accepts API keys, but a key minting more keys is intentionally harmless since
// it can only act within its own user's scope). The plaintext key is returned
// exactly once, on creation.

function publicView(k: typeof apiKeys.$inferSelect) {
  return {
    id: k.id,
    name: k.name,
    prefix: k.prefix,
    userId: k.userId,
    lastUsedAt: k.lastUsedAt,
    expiresAt: k.expiresAt,
    revoked: k.revoked,
    createdAt: k.createdAt,
  };
}

// GET /api-keys — list the caller's keys. Admins may list another user's with
// ?userId=<clerkId> (used by the admin UI to provision service accounts).
router.get("/", requireAuth, async (req: AuthRequest, res) => {
  const requested = typeof req.query.userId === "string" ? req.query.userId : null;
  let ownerId = req.userId!;
  if (requested && requested !== req.userId) {
    if (req.role !== "admin") return res.status(403).json({ error: "Forbidden" });
    ownerId = requested;
  }

  const keys = await db
    .select()
    .from(apiKeys)
    .where(eq(apiKeys.userId, ownerId))
    .orderBy(desc(apiKeys.createdAt));
  return res.json(keys.map(publicView));
});

// POST /api-keys — mint a key. Body: { name, userId?, expiresInDays? }.
// `userId` (admin only) mints the key for another user — e.g. a service account
// — without having to log in as them.
router.post("/", requireAuth, async (req: AuthRequest, res) => {
  const { name, userId, expiresInDays } = req.body as {
    name?: string;
    userId?: string;
    expiresInDays?: number;
  };

  if (!name || !String(name).trim()) {
    return res.status(400).json({ error: "name is required" });
  }

  let ownerId = req.userId!;
  if (userId && userId !== req.userId) {
    if (req.role !== "admin") return res.status(403).json({ error: "Forbidden" });
    ownerId = userId;
  }

  const expiresAt =
    typeof expiresInDays === "number" && expiresInDays > 0
      ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000)
      : null;

  const { key, prefix, hash } = generateApiKey();
  const [created] = await db
    .insert(apiKeys)
    .values({ userId: ownerId, name: String(name).trim(), keyHash: hash, prefix, expiresAt })
    .returning();

  // `key` is the only time the plaintext is ever exposed.
  return res.status(201).json({ ...publicView(created), key });
});

// DELETE /api-keys/:id — revoke. Owner or admin only.
router.delete("/:id", requireAuth, async (req: AuthRequest, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: "Invalid id" });

  const [key] = await db.select().from(apiKeys).where(eq(apiKeys.id, id)).limit(1);
  if (!key) return res.status(404).json({ error: "Not found" });
  if (key.userId !== req.userId && req.role !== "admin") {
    return res.status(403).json({ error: "Forbidden" });
  }

  await db.update(apiKeys).set({ revoked: true }).where(eq(apiKeys.id, id));
  return res.json({ ok: true });
});

export default router;
