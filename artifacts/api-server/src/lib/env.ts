import { existsSync } from "node:fs";
import { resolve } from "node:path";

// Load a local .env file for bare-metal development. In Docker and Replit the
// environment is injected by the platform, so this is a no-op when no file is
// found. Imported first in index.ts so vars are present before db.ts (and other
// modules) read process.env at import time.
const candidates = [
  process.env.ENV_FILE,
  resolve(process.cwd(), ".env"),
  resolve(process.cwd(), "..", "..", ".env"),
].filter((p): p is string => Boolean(p));

const loadEnvFile = (process as NodeJS.Process & {
  loadEnvFile?: (path: string) => void;
}).loadEnvFile;

for (const file of candidates) {
  if (existsSync(file)) {
    try {
      loadEnvFile?.(file);
    } catch {
      // Ignore a malformed/unreadable .env — fall through to platform env.
    }
    break;
  }
}
