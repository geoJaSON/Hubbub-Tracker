import { Router } from "express";
import bcrypt from "bcryptjs";
import { eq, count } from "drizzle-orm";
import { db } from "../lib/db";
import { users } from "../lib/schema";
import { signToken } from "../lib/auth";

const router = Router();

function omitHash(user: typeof users.$inferSelect) {
  const { passwordHash: _, ...rest } = user;
  return rest;
}

function issueToken(user: typeof users.$inferSelect) {
  return signToken({
    sub: user.clerkId!,
    localUserId: user.id,
    role: user.role,
  });
}

// POST /api/auth/login
router.post("/login", async (req, res) => {
  const { email, password } = req.body as { email?: string; password?: string };
  if (!email || !password) {
    return res.status(400).json({ error: "Email and password required" });
  }

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, email.toLowerCase()))
    .limit(1);

  if (!user) {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  if (!user.passwordHash) {
    return res.status(401).json({ error: "password_not_set", message: "Use /setup-password to set your initial password" });
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  if (!user.active) {
    return res.status(403).json({ error: "Account disabled" });
  }

  return res.json({ token: issueToken(user), user: omitHash(user) });
});

// POST /api/auth/register
//
// Registration policy (all configurable for self-hosting):
//   - The very first account always succeeds and becomes `admin` (bootstrap).
//   - An admin can pre-create a user (POST /users, no password). That person
//     "claims" the record by registering with the same email — keeping the
//     role/rate/memberships the admin assigned.
//   - Otherwise, open self-signup is allowed unless ALLOW_OPEN_SIGNUP="false".
//   - If ALLOWED_EMAIL_DOMAIN is set, the email must belong to that domain.
router.post("/register", async (req, res) => {
  const { email, password, displayName, username } = req.body as {
    email?: string;
    password?: string;
    displayName?: string;
    username?: string;
  };

  if (!email || !password) {
    return res.status(400).json({ error: "Email and password required" });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: "Password must be at least 8 characters" });
  }

  const normalizedEmail = email.toLowerCase().trim();

  const allowedDomain = process.env.ALLOWED_EMAIL_DOMAIN?.trim().replace(/^@/, "");
  if (allowedDomain && !normalizedEmail.endsWith(`@${allowedDomain.toLowerCase()}`)) {
    return res.status(403).json({
      error: "domain_not_allowed",
      message: `Only @${allowedDomain} accounts are permitted.`,
    });
  }

  const [existing] = await db
    .select()
    .from(users)
    .where(eq(users.email, normalizedEmail))
    .limit(1);

  // An existing record with a password set is a real, claimed account.
  if (existing?.passwordHash) {
    return res.status(409).json({ error: "Email already registered" });
  }

  const [{ count: userCount } = { count: 0 }] = await db
    .select({ count: count() })
    .from(users);
  const isFirstUser = userCount === 0;

  // Gate open self-signup. The first user and claimable pre-created records are
  // always allowed so the operator never locks themselves out.
  const openSignup = process.env.ALLOW_OPEN_SIGNUP !== "false";
  if (!openSignup && !isFirstUser && !existing) {
    return res.status(403).json({
      error: "signup_closed",
      message: "Self-registration is disabled. Ask an admin to invite you.",
    });
  }

  const passwordHash = await bcrypt.hash(password, 12);

  // Claim an admin-pre-created record: keep its stable id (so any project
  // memberships/role the admin assigned stay intact), just set the password.
  if (existing) {
    const [claimed] = await db
      .update(users)
      .set({
        passwordHash,
        ...(displayName ? { displayName } : {}),
        ...(username ? { username } : {}),
      })
      .where(eq(users.id, existing.id))
      .returning();
    return res.status(200).json({ token: issueToken(claimed), user: omitHash(claimed) });
  }

  const [adminRow] = await db
    .select({ count: count() })
    .from(users)
    .where(eq(users.role, "admin"));
  const noAdmins = (adminRow?.count ?? 0) === 0;

  const localId = crypto.randomUUID();
  const [created] = await db
    .insert(users)
    .values({
      clerkId: localId,
      email: normalizedEmail,
      displayName: displayName ?? normalizedEmail.split("@")[0],
      username: username ?? null,
      role: noAdmins ? "admin" : "member",
      passwordHash,
    })
    .returning();

  return res.status(201).json({ token: issueToken(created), user: omitHash(created) });
});

// POST /api/auth/setup-password  (for migrated users who have no password yet)
// Protected by SESSION_SECRET as a setup token so only the server operator can use it.
router.post("/setup-password", async (req, res) => {
  const { email, password, setupToken } = req.body as {
    email?: string;
    password?: string;
    setupToken?: string;
  };

  const secret = process.env.SESSION_SECRET ?? process.env.JWT_SECRET;
  if (!setupToken || setupToken !== secret) {
    return res.status(403).json({ error: "Invalid setup token" });
  }
  if (!email || !password) {
    return res.status(400).json({ error: "Email and password required" });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: "Password must be at least 8 characters" });
  }

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, email.toLowerCase()))
    .limit(1);

  if (!user) {
    return res.status(404).json({ error: "User not found" });
  }
  if (user.passwordHash) {
    return res.status(409).json({ error: "Password already set — use the normal login flow" });
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const [updated] = await db
    .update(users)
    .set({ passwordHash })
    .where(eq(users.id, user.id))
    .returning();

  return res.json({ token: issueToken(updated), user: omitHash(updated) });
});

export default router;
