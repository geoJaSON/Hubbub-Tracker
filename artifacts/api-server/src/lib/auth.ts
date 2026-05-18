import { Request, Response, NextFunction } from "express";
import { getAuth } from "@clerk/express";
import { db } from "./db";
import { users } from "./schema";
import { eq } from "drizzle-orm";

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
  next();
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
