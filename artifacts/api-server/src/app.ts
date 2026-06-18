import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import { existsSync } from "node:fs";
import path from "node:path";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

app.use(cors({ credentials: true, origin: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

// ── Static SPA (production / single-container deploy) ──────────────────────────
// When the built frontend is present (Docker sets WEB_DIST), serve it from the
// same origin as the API so the SPA's same-origin `/api` calls just work — no
// proxy needed. In dev this directory is absent and Vite serves the SPA instead.
const webDist =
  process.env.WEB_DIST ??
  path.resolve(process.cwd(), "..", "hubbub", "dist", "public");

if (existsSync(webDist)) {
  app.use(express.static(webDist));
  // SPA fallback: any non-API GET returns index.html for client-side routing.
  app.use((req, res, next) => {
    if (req.method !== "GET" || req.path.startsWith("/api")) return next();
    res.sendFile(path.join(webDist, "index.html"));
  });
  logger.info({ webDist }, "Serving static SPA");
}

export default app;
