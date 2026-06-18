import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { db } from "./db";
import { projects, projectMembers, users, apiKeys } from "./schema";
import { eq, and } from "drizzle-orm";
import { hashApiKey } from "./crypto";

export interface AuthRequest extends Request {
  userId?: string;
  localUserId?: number;
  role?: string;
}

interface Principal {
  sub: string;
  localUserId: number;
  role: string;
}

function getSecret(): string {
  const s = process.env.JWT_SECRET ?? process.env.SESSION_SECRET;
  if (!s) throw new Error("JWT_SECRET must be set");
  return s;
}

function extractToken(req: Request): string | null {
  const auth = req.headers.authorization;
  if (auth?.startsWith("Bearer ")) return auth.slice(7);
  return null;
}

function verifyToken(token: string): Principal | null {
  try {
    return jwt.verify(token, getSecret()) as Principal;
  } catch {
    return null;
  }
}

// Resolve a bearer token to a principal. Two credential types are supported:
//   - API keys (prefix "hbk_"): looked up by sha256 hash; rejected if revoked or
//     expired. The key inherits its owning user's role and project memberships.
//   - JWT session tokens: verified with JWT_SECRET.
async function resolvePrincipal(token: string): Promise<Principal | null> {
  if (token.startsWith("hbk_")) {
    const [key] = await db
      .select()
      .from(apiKeys)
      .where(eq(apiKeys.keyHash, hashApiKey(token)))
      .limit(1);
    if (!key || key.revoked) return null;
    if (key.expiresAt && key.expiresAt.getTime() <= Date.now()) return null;

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.clerkId, key.userId))
      .limit(1);
    if (!user || !user.active) return null;

    // Best-effort last-used stamp; never block (or fail) the request on it.
    void db
      .update(apiKeys)
      .set({ lastUsedAt: new Date() })
      .where(eq(apiKeys.id, key.id))
      .catch(() => {});

    return { sub: user.clerkId!, localUserId: user.id, role: user.role };
  }
  return verifyToken(token);
}

export const requireAuth = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  const token = extractToken(req);
  if (!token) return res.status(401).json({ error: "Unauthorized" });

  const payload = await resolvePrincipal(token);
  if (!payload) return res.status(401).json({ error: "Unauthorized" });

  req.userId = payload.sub;
  req.localUserId = payload.localUserId;
  req.role = payload.role;
  return next();
};

export const requireAdmin = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  const token = extractToken(req);
  if (!token) return res.status(401).json({ error: "Unauthorized" });

  const payload = await resolvePrincipal(token);
  if (!payload) return res.status(401).json({ error: "Unauthorized" });
  if (payload.role !== "admin") return res.status(403).json({ error: "Forbidden" });

  req.userId = payload.sub;
  req.localUserId = payload.localUserId;
  req.role = payload.role;
  return next();
};

export const requireProjectMember = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  if (!req.userId) return res.status(401).json({ error: "Unauthorized" });

  const slug = (req.params as Record<string, string>).slug;
  if (!slug) return next();

  const [project] = await db
    .select()
    .from(projects)
    .where(eq(projects.slug, slug))
    .limit(1);
  if (!project) return res.status(404).json({ error: "Project not found" });

  const [member] = await db
    .select()
    .from(projectMembers)
    .where(
      and(
        eq(projectMembers.projectId, project.id),
        eq(projectMembers.userId, req.userId),
      ),
    )
    .limit(1);

  if (!member) {
    return res.status(403).json({ error: "Forbidden: not a project member" });
  }

  (req as AuthRequest & { project?: typeof project; projectRole?: string }).project = project;
  (req as AuthRequest & { project?: typeof project; projectRole?: string }).projectRole = member.role;
  next();
};

export const softAuth = async (
  req: AuthRequest,
  _res: Response,
  next: NextFunction,
) => {
  const token = extractToken(req);
  if (token) {
    const payload = await resolvePrincipal(token);
    if (payload) {
      req.userId = payload.sub;
      req.localUserId = payload.localUserId;
      req.role = payload.role;
    }
  }
  next();
};

export function signToken(payload: { sub: string; localUserId: number; role: string }): string {
  return jwt.sign(payload, getSecret(), { expiresIn: "7d" });
}
