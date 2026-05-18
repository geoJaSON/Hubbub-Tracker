/**
 * PostgreSQL LISTEN/NOTIFY helpers for SSE real-time chat.
 * Each SSE connection opens a dedicated pg.Client that LISTENs on a
 * per-project channel; the POST /messages handler notifies that channel.
 * This avoids in-memory state and works across multiple server processes.
 */
import pg from "pg";

const { Client } = pg;

const CHANNEL = (projectId: number) => `msgs_${projectId}`;

/**
 * Subscribe to new messages for a project. Returns a cleanup function that
 * un-listens and closes the dedicated client.
 */
export async function subscribeToProject(
  projectId: number,
  onPayload: (data: unknown) => void,
): Promise<() => void> {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  const ch = CHANNEL(projectId);
  await client.query(`LISTEN "${ch}"`);

  const handler = (msg: pg.Notification) => {
    if (msg.channel === ch && msg.payload) {
      try {
        onPayload(JSON.parse(msg.payload));
      } catch {
        /* ignore malformed JSON */
      }
    }
  };

  client.on("notification", handler);

  // If the DB disconnects, log but don't crash the process
  client.on("error", (err) => {
    console.error("[pgnotify] client error:", err.message);
  });

  return () => {
    client.removeListener("notification", handler);
    client
      .query(`UNLISTEN "${ch}"`)
      .catch(() => {})
      .finally(() => client.end().catch(() => {}));
  };
}

/**
 * Notify all SSE listeners for a project by calling pg_notify.
 * Uses a one-shot pool client so the main pool is not monopolised.
 */
export async function notifyProject(
  pool: pg.Pool,
  projectId: number,
  payload: unknown,
): Promise<void> {
  const ch = CHANNEL(projectId);
  await pool.query("SELECT pg_notify($1, $2)", [ch, JSON.stringify(payload)]);
}
