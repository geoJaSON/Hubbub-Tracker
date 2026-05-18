import app from "./app";
import { logger } from "./lib/logger";
import { db, pool } from "./lib/db";
import { projects, commits, commitItems, items, messages } from "./lib/schema";
import { eq, sql, and } from "drizzle-orm";
import { notifyProject } from "./lib/pgnotify";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error("PORT environment variable is required but was not provided.");
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }
  logger.info({ port }, "Server listening");
});

// ── GitHub Commit Poller ──────────────────────────────────────────────────────
// Polls the GitHub API every 5 minutes for projects that have a githubRepo set.
// Upserts commits and auto-links items referenced as "#N" in commit messages.

async function pollGitHubCommits() {
  try {
    const projectRows = await db
      .select()
      .from(projects)
      .where(sql`${projects.githubRepo} IS NOT NULL AND ${projects.archived} = false`);

    for (const project of projectRows) {
      if (!project.githubRepo) continue;

      try {
        // Support both "owner/repo" and full GitHub URLs
        const repoPath = project.githubRepo
          .replace(/^https?:\/\/github\.com\//, "")
          .replace(/\.git$/, "")
          .trim();
        if (!repoPath.includes("/")) continue;

        const headers: Record<string, string> = {
          Accept: "application/vnd.github.v3+json",
          "User-Agent": "hubbub-poller/1.0",
        };
        const token = project.githubToken ?? process.env.GITHUB_TOKEN;
        if (token) {
          headers["Authorization"] = `Bearer ${token}`;
        }

        const resp = await fetch(
          `https://api.github.com/repos/${repoPath}/commits?per_page=20`,
          { headers },
        );
        if (!resp.ok) {
          logger.warn(
            { project: project.slug, repo: repoPath, status: resp.status },
            "GitHub API returned non-200 — skipping project",
          );
          continue;
        }

        const ghCommits = (await resp.json()) as Array<{
          sha: string;
          commit: {
            message: string;
            author: { name: string; date: string };
          };
          author: { login: string } | null;
          html_url: string;
        }>;

        const newCommits: Array<{ message: string; authorName: string; authorGithub: string | null }> = [];

        for (const c of ghCommits) {
          const [inserted] = await db
            .insert(commits)
            .values({
              projectId: project.id,
              sha: c.sha,
              message: c.commit.message.split("\n")[0].slice(0, 500),
              authorName: c.commit.author.name,
              authorGithub: c.author?.login ?? null,
              url: c.html_url,
              committedAt: new Date(c.commit.author.date),
            })
            .onConflictDoNothing()
            .returning();

          if (inserted) {
            newCommits.push({
              message: inserted.message,
              authorName: inserted.authorName ?? c.commit.author.name,
              authorGithub: inserted.authorGithub,
            });

            // Auto-link items referenced as "#N" in the commit message
            const refs = [...c.commit.message.matchAll(/#(\d+)/g)].map((m) =>
              Number(m[1]),
            );
            for (const num of refs) {
              const [item] = await db
                .select({ id: items.id })
                .from(items)
                .where(
                  and(
                    eq(items.projectId, project.id),
                    eq(items.number, num),
                  ),
                )
                .limit(1);
              if (item) {
                await db
                  .insert(commitItems)
                  .values({ commitId: inserted.id, itemId: item.id })
                  .onConflictDoNothing();
              }
            }
          }
        }

        if (newCommits.length > 0) {
          // Build a concise chat notification
          const latest = newCommits[0];
          const countLabel =
            newCommits.length === 1
              ? "1 new commit"
              : `${newCommits.length} new commits`;

          // Determine unique authors across the batch
          const authorHandles = [
            ...new Set(
              newCommits.map((c) =>
                c.authorGithub ? `@${c.authorGithub}` : c.authorName,
              ),
            ),
          ];
          const authorLabel =
            authorHandles.length <= 2
              ? authorHandles.join(" & ")
              : `${authorHandles[0]} +${authorHandles.length - 1} others`;

          const notifBody = `${countLabel} from ${authorLabel} — latest: ${latest.message}`;

          const [sysMsg] = await db
            .insert(messages)
            .values({ projectId: project.id, authorId: "system", body: notifBody })
            .returning();

          await notifyProject(pool, project.id, {
            type: "message",
            message: { ...sysMsg, author: null },
          });

          logger.info(
            { project: project.slug, newCommits: newCommits.length },
            "Posted GitHub commit notification to chat",
          );
        }
      } catch (projectErr) {
        // Log per-project errors but continue polling other projects
        logger.warn({ project: project.slug, err: projectErr }, "GitHub poll error");
      }
    }
  } catch (err) {
    logger.warn({ err }, "GitHub poller top-level error");
  }
}

// ── Docs Full-Text Search Index ───────────────────────────────────────────────
// Creates a GIN tsvector index on docs(title, body) for fast full-text search.
// Runs once on startup; CONCURRENTLY + IF NOT EXISTS make it safe to repeat.
async function ensureDocsFtsIndex() {
  try {
    // Add the "order" column to docs if it doesn't exist yet (schema migration)
    await db.execute(sql`
      ALTER TABLE docs ADD COLUMN IF NOT EXISTS "order" integer NOT NULL DEFAULT 0
    `);
    // Create GIN index for full-text search on title + body
    await db.execute(sql`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS docs_fts_gin_idx
      ON docs USING GIN (to_tsvector('english', title || ' ' || COALESCE(body, '')))
    `);
    logger.info("docs_fts_gin_idx ready");
  } catch (err) {
    logger.warn({ err }, "Could not create docs FTS index — search will still work without it");
  }
}

// ── Projects github_token Column Migration ────────────────────────────────────
// Adds the github_token column to projects if it doesn't exist yet.
async function ensureProjectsGithubToken() {
  try {
    await db.execute(sql`
      ALTER TABLE projects ADD COLUMN IF NOT EXISTS github_token text
    `);
    logger.info("projects.github_token column ready");
  } catch (err) {
    logger.warn({ err }, "Could not add github_token column to projects");
  }
}

// Run migrations first, then start the poller so the schema is ready
async function startup() {
  await ensureProjectsGithubToken();
  await ensureDocsFtsIndex();
  // Run immediately on startup, then every 5 minutes
  pollGitHubCommits().catch(() => {});
  setInterval(() => pollGitHubCommits().catch(() => {}), 5 * 60 * 1000);
}

startup().catch(() => {});
