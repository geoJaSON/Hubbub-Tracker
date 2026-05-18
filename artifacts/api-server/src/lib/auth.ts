import { Request, Response, NextFunction } from "express";
import { getAuth } from "@clerk/express";
import { db } from "./db";
import { users, projects, projectMembers } from "./schema";
import { eq, and } from "drizzle-orm";

export interface AuthRequest extends Request {
  userId?: string;
  localUserId?: number;
}

export const requireAuth = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  const auth = getAuth(req);
  const clerkId = auth?.userId;
  if (!clerkId) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  req.userId = clerkId;

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.clerkId, clerkId))
    .limit(1);

  if (!user) {
    return res.status(401).json({ error: "User not provisioned" });
  }
  req.localUserId = user.id;
  return next();
};

export const requireAdmin = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  const auth = getAuth(req);
  const clerkId = auth?.userId;
  if (!clerkId) return res.status(401).json({ error: "Unauthorized" });

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.clerkId, clerkId))
    .limit(1);

  if (!user || user.role !== "admin") {
    return res.status(403).json({ error: "Forbidden" });
  }
  req.userId = clerkId;
  req.localUserId = user.id;
  return next();
};

/** Verify the signed-in user is a member of the project identified by
 *  `req.params.slug`. Must be used AFTER `requireAuth`.
 *  Attaches `req.project` and `req.projectRole` for downstream handlers.
 */
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
  (req as AuthRequest & { project?: typeof project; projectRole?: string }).projectRole =
    member.role;
  next();
};

export const softAuth = async (
  req: AuthRequest,
  _res: Response,
  next: NextFunction,
) => {
  const auth = getAuth(req);
  const clerkId = auth?.userId;
  if (clerkId) {
    req.userId = clerkId;
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.clerkId, clerkId))
      .limit(1);
    if (user) req.localUserId = user.id;
  }
  next();
};
