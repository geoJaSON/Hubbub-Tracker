import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { db } from "./db";
import { projects, projectMembers } from "./schema";
import { eq, and } from "drizzle-orm";

export interface AuthRequest extends Request {
  userId?: string;
  localUserId?: number;
}

interface JwtPayload {
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

function verifyToken(token: string): JwtPayload | null {
  try {
    return jwt.verify(token, getSecret()) as JwtPayload;
  } catch {
    return null;
  }
}

export const requireAuth = (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  const token = extractToken(req);
  if (!token) return res.status(401).json({ error: "Unauthorized" });

  const payload = verifyToken(token);
  if (!payload) return res.status(401).json({ error: "Unauthorized" });

  req.userId = payload.sub;
  req.localUserId = payload.localUserId;
  return next();
};

export const requireAdmin = (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  const token = extractToken(req);
  if (!token) return res.status(401).json({ error: "Unauthorized" });

  const payload = verifyToken(token);
  if (!payload) return res.status(401).json({ error: "Unauthorized" });
  if (payload.role !== "admin") return res.status(403).json({ error: "Forbidden" });

  req.userId = payload.sub;
  req.localUserId = payload.localUserId;
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

export const softAuth = (
  req: AuthRequest,
  _res: Response,
  next: NextFunction,
) => {
  const token = extractToken(req);
  if (token) {
    const payload = verifyToken(token);
    if (payload) {
      req.userId = payload.sub;
      req.localUserId = payload.localUserId;
    }
  }
  next();
};

export function signToken(payload: { sub: string; localUserId: number; role: string }): string {
  return jwt.sign(payload, getSecret(), { expiresIn: "7d" });
}
