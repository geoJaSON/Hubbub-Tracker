import { db } from "./db";
import { activityEvents } from "./schema";

type ActivityType =
  | "item_created"
  | "item_status_changed"
  | "item_assigned"
  | "comment_added"
  | "commit_linked"
  | "message_posted"
  | "cost_added"
  | "decision_logged"
  | "attachment_added";

export async function logActivity(
  type: ActivityType,
  actorId: string | null,
  projectId: number | null,
  payload: Record<string, unknown>,
) {
  try {
    await db.insert(activityEvents).values({
      type,
      actorId,
      projectId,
      payload,
    });
  } catch (e) {
    // Don't let activity logging break the main request
    console.error("Failed to log activity", e);
  }
}
