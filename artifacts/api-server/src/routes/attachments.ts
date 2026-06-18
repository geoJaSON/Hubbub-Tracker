import { Router, type Request, type Response, type NextFunction } from "express";
import multer from "multer";
import { randomUUID } from "node:crypto";
import { eq, and, desc } from "drizzle-orm";
import { db } from "../lib/db";
import {
  projects,
  items,
  comments,
  scopes,
  messages,
  attachments,
  users,
} from "../lib/schema";
import { requireAuth, AuthRequest } from "../lib/auth";
import { logActivity } from "../lib/activity";
import { getStorage } from "../lib/storage";

const router = Router({ mergeParams: true });

const MAX_BYTES = Number(process.env.UPLOAD_MAX_BYTES ?? 25 * 1024 * 1024);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BYTES },
});

const ENTITY_TYPES = ["item", "comment", "scope", "message"] as const;
type EntityType = (typeof ENTITY_TYPES)[number];

function isEntityType(v: unknown): v is EntityType {
  return typeof v === "string" && (ENTITY_TYPES as readonly string[]).includes(v);
}

async function getProject(slug: string) {
  const [project] = await db
    .select()
    .from(projects)
    .where(eq(projects.slug, slug))
    .limit(1);
  return project ?? null;
}

// Confirm the (entityType, entityId) row exists and belongs to the project.
async function entityInProject(
  entityType: EntityType,
  entityId: number,
  projectId: number,
): Promise<boolean> {
  switch (entityType) {
    case "item": {
      const [r] = await db
        .select({ id: items.id })
        .from(items)
        .where(and(eq(items.id, entityId), eq(items.projectId, projectId)))
        .limit(1);
      return !!r;
    }
    case "scope": {
      const [r] = await db
        .select({ id: scopes.id })
        .from(scopes)
        .where(and(eq(scopes.id, entityId), eq(scopes.projectId, projectId)))
        .limit(1);
      return !!r;
    }
    case "message": {
      const [r] = await db
        .select({ id: messages.id })
        .from(messages)
        .where(and(eq(messages.id, entityId), eq(messages.projectId, projectId)))
        .limit(1);
      return !!r;
    }
    case "comment": {
      const [r] = await db
        .select({ id: comments.id })
        .from(comments)
        .innerJoin(items, eq(comments.itemId, items.id))
        .where(and(eq(comments.id, entityId), eq(items.projectId, projectId)))
        .limit(1);
      return !!r;
    }
  }
}

function withUploader<T extends { uploadedBy: string }>(
  rows: T[],
  userRows: (typeof users.$inferSelect)[],
) {
  return rows.map((a) => {
    const u = userRows.find((x) => x.clerkId === a.uploadedBy);
    return {
      ...a,
      uploader: u
        ? { id: u.id, displayName: u.displayName, avatarUrl: u.avatarUrl }
        : null,
    };
  });
}

// POST /projects/:slug/attachments  (multipart: file + entityType + entityId)
router.post("/", requireAuth, upload.single("file"), async (req: AuthRequest, res) => {
  const project = await getProject(String(req.params.slug));
  if (!project) return res.status(404).json({ error: "Not found" });

  const file = req.file;
  if (!file) return res.status(400).json({ error: "file is required" });

  const entityType = req.body.entityType;
  const entityId = Number(req.body.entityId);
  if (!isEntityType(entityType) || !Number.isInteger(entityId)) {
    return res.status(400).json({ error: "entityType and entityId required" });
  }
  if (!(await entityInProject(entityType, entityId, project.id))) {
    return res.status(404).json({ error: "Target not found in project" });
  }

  const storage = getStorage();
  const safeName = file.originalname.replace(/[/\\]/g, "_").slice(0, 200) || "file";
  const storageKey = `${project.id}/${entityType}/${entityId}/${randomUUID()}-${safeName}`;
  await storage.put(storageKey, file.buffer, file.mimetype);

  const [created] = await db
    .insert(attachments)
    .values({
      projectId: project.id,
      entityType,
      entityId,
      filename: safeName,
      mimeType: file.mimetype || "application/octet-stream",
      sizeBytes: file.size,
      storageBackend: storage.name,
      storageKey,
      uploadedBy: req.userId!,
    })
    .returning();

  await logActivity("attachment_added", req.userId!, project.id, {
    attachmentId: created.id,
    entityType,
    entityId,
    filename: safeName,
  });

  const [uploader] = await db
    .select()
    .from(users)
    .where(eq(users.clerkId, req.userId!))
    .limit(1);
  return res.status(201).json(withUploader([created], uploader ? [uploader] : [])[0]);
});

// GET /projects/:slug/attachments/:id/download
router.get("/:id/download", requireAuth, async (req, res) => {
  const project = await getProject(String(req.params.slug));
  if (!project) return res.status(404).json({ error: "Not found" });

  const [row] = await db
    .select()
    .from(attachments)
    .where(
      and(
        eq(attachments.id, Number(req.params.id)),
        eq(attachments.projectId, project.id),
      ),
    )
    .limit(1);
  if (!row) return res.status(404).json({ error: "Not found" });

  const dispositionName = row.filename.replace(/["\r\n]/g, "");
  res.setHeader("Content-Type", row.mimeType);
  // Always download (never render inline) to avoid stored-XSS via attachments.
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${dispositionName}"`,
  );
  res.setHeader("Content-Length", String(row.sizeBytes));

  const stream = await getStorage().getStream(row.storageKey);
  stream.on("error", () => {
    if (!res.headersSent) res.status(500).end();
    else res.destroy();
  });
  stream.pipe(res);
  return;
});

// DELETE /projects/:slug/attachments/:id  (any project member)
router.delete("/:id", requireAuth, async (req, res) => {
  const project = await getProject(String(req.params.slug));
  if (!project) return res.status(404).json({ error: "Not found" });

  const [row] = await db
    .select()
    .from(attachments)
    .where(
      and(
        eq(attachments.id, Number(req.params.id)),
        eq(attachments.projectId, project.id),
      ),
    )
    .limit(1);
  if (!row) return res.status(404).json({ error: "Not found" });

  await getStorage().delete(row.storageKey);
  await db.delete(attachments).where(eq(attachments.id, row.id));
  return res.status(204).send();
});

// GET /projects/:slug/attachments/:entityType/:entityId
// Registered after /:id/download so a numeric "/5/download" matches that first.
router.get("/:entityType/:entityId", requireAuth, async (req, res) => {
  const project = await getProject(String(req.params.slug));
  if (!project) return res.status(404).json({ error: "Not found" });

  const entityType = req.params.entityType;
  const entityId = Number(req.params.entityId);
  if (!isEntityType(entityType) || !Number.isInteger(entityId)) {
    return res.status(400).json({ error: "entityType and entityId required" });
  }

  const rows = await db
    .select()
    .from(attachments)
    .where(
      and(
        eq(attachments.projectId, project.id),
        eq(attachments.entityType, entityType),
        eq(attachments.entityId, entityId),
      ),
    )
    .orderBy(desc(attachments.createdAt));

  const uploaderIds = [...new Set(rows.map((r) => r.uploadedBy))];
  const userRows = uploaderIds.length ? await db.select().from(users) : [];
  return res.json(withUploader(rows, userRows));
});

// Map multer's file-size error to 413 for this router's uploads.
router.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
  if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
    return res.status(413).json({
      error: "file_too_large",
      message: `Max file size is ${MAX_BYTES} bytes`,
    });
  }
  return next(err);
});

export default router;
