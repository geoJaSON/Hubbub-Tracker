import { db } from "./db";
import { notifications } from "./schema";

export type NotificationType =
  | "mention"
  | "assigned"
  | "status_changed"
  | "comment_on_watched"
  | "reply";

export interface NewNotification {
  recipientId: string;
  actorId?: string | null;
  type: NotificationType;
  projectId?: number | null;
  itemId?: number | null;
  payload?: Record<string, unknown>;
}

// Single fan-out chokepoint for all notification creation. Best-effort: a failure
// here must never break the request that triggered it (mirrors logActivity).
export async function createNotifications(rows: NewNotification[]): Promise<void> {
  if (rows.length === 0) return;
  try {
    await db.insert(notifications).values(
      rows.map((r) => ({
        recipientId: r.recipientId,
        actorId: r.actorId ?? null,
        type: r.type,
        projectId: r.projectId ?? null,
        itemId: r.itemId ?? null,
        payload: r.payload ?? {},
      })),
    );
    // Future seam: per-user SSE push + external delivery (email/webhook) here.
  } catch (e) {
    console.error("Failed to create notifications", e);
  }
}
