// Regenerates artifacts/hubbub/src/lib/test-plan-seed.ts from the inline DATA
// array in mobile-test-plan.html (the original browser-only checklist). Run with:
//   node scripts/gen-seed.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const srcHtml = path.join(root, "mobile-test-plan.html");
const outFile = path.join(root, "artifacts/hubbub/src/lib/test-plan-seed.ts");

const html = readFileSync(srcHtml, "utf8");

// Extract the `const DATA = [ ... ];` array literal from the inline <script>.
const start = html.indexOf("const DATA = ");
const end = html.indexOf("const STATUSES");
if (start === -1 || end === -1) throw new Error("Could not locate DATA array");
let arrText = html.slice(start + "const DATA = ".length, end).trim();
arrText = arrText.replace(/;\s*$/, "");

const DATA = eval("(" + arrText + ")");

function strip(s) {
  if (s == null) return "";
  return String(s)
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const suites = DATA.map((sec) => ({
  code: sec.id,
  title: strip(sec.title),
  warn: Boolean(sec.warn),
  cases: sec.rows.map((r) => ({
    code: r[0],
    title: strip(r[1]),
    expected: strip(r[2]),
    owner: r[3],
  })),
}));

const banner = `// AUTO-GENERATED from mobile-test-plan.html — the starter "Field App" manual
// test plan. Imported on demand from the Testing tab's empty state; edit there,
// not here. Regenerate with \`node scripts/gen-seed.mjs\` if the source changes.\n`;

const out =
  banner +
  `import type { TestPlanImport } from "@workspace/api-client-react";\n\n` +
  `export const MOBILE_TEST_PLAN: TestPlanImport = ${JSON.stringify({ suites }, null, 2)};\n`;

writeFileSync(outFile, out, "utf8");

const caseCount = suites.reduce((n, s) => n + s.cases.length, 0);
console.log(`Wrote test-plan-seed.ts: ${suites.length} suites, ${caseCount} cases`);
