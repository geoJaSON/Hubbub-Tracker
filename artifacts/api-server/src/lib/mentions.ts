import { eq } from "drizzle-orm";
import { db } from "./db";
import { users, projectMembers } from "./schema";

const MENTION_RE = /@([A-Za-z0-9._-]+)/g;

// Extract @mentions from a body and resolve them to project-member user ids
// (the stable string id stored in users.clerkId). Matching is scoped to members
// of the given project so a mention can never notify someone outside it.
export async function resolveMentions(
  body: string,
  projectId: number,
): Promise<string[]> {
  const tokens = [...body.matchAll(MENTION_RE)].map((m) => m[1].toLowerCase());
  if (tokens.length === 0) return [];
  const wanted = new Set(tokens);

  const members = await db
    .select({
      clerkId: users.clerkId,
      username: users.username,
      displayName: users.displayName,
    })
    .from(projectMembers)
    .innerJoin(users, eq(users.clerkId, projectMembers.userId))
    .where(eq(projectMembers.projectId, projectId));

  const matched = new Set<string>();
  for (const m of members) {
    if (!m.clerkId) continue;
    const uname = m.username?.toLowerCase();
    const dname = m.displayName.toLowerCase().replace(/\s+/g, "");
    if ((uname && wanted.has(uname)) || wanted.has(dname)) {
      matched.add(m.clerkId);
    }
  }
  return [...matched];
}
