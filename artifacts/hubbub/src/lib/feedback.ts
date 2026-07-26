// Parser for user-submitted feedback items created by BEACON.
//
// BEACON files feedback into Hubbub as `bug` / `request` items whose
// description ends with a metadata footer:
//
//   <body text>
//
//   ---
//   Submitted from BEACON web app
//   Reporter: Jane Smith
//   Role: admin
//   Auth user: 30c5814a-...
//   Page: https://beacon.example.com/companies/42   (optional)
//
// Identification rule (per the BEACON handoff): an item counts as
// user-submitted when its type is bug/request AND the description contains the
// footer boundary AND the footer has an "Auth user:" line. Title prefixes are
// cosmetic validation only — titles can be edited in Hubbub.
import type { Item } from "@workspace/api-client-react";

export type FeedbackItem = {
  number: number;
  kind: "bug" | "request";
  title: string;
  body: string;
  reporter: string | null;
  role: string | null;
  authUserId: string;
  pageUrl: string | null;
  status: string;
  priority: string | null;
  createdAt: string;
  closedAt: string | null;
};

const FOOTER_BOUNDARY = "\n---\nSubmitted from BEACON web app";
const TITLE_PREFIXES = ["User-reported bug:", "User feature request:"];

function stripTitlePrefix(title: string): string {
  for (const prefix of TITLE_PREFIXES) {
    if (title.toLowerCase().startsWith(prefix.toLowerCase())) {
      return title.slice(prefix.length).trim();
    }
  }
  return title.trim();
}

// Footer lines are "Label: value"; split at the FIRST colon only, since page
// URLs contain colons.
function parseFooterLines(footer: string): Map<string, string> {
  const fields = new Map<string, string>();
  for (const line of footer.split("\n")) {
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const label = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();
    if (label && value) fields.set(label, value);
  }
  return fields;
}

export function parseFeedbackItem(item: Item): FeedbackItem | null {
  if (item.type !== "bug" && item.type !== "request") return null;
  if (!item.description) return null;

  const desc = item.description.replace(/\r\n/g, "\n");
  // Use the LAST boundary — user-entered text can itself contain "---".
  const at = desc.lastIndexOf(FOOTER_BOUNDARY);
  if (at === -1) return null;

  const body = desc.slice(0, at).trim();
  const footer = desc.slice(at + FOOTER_BOUNDARY.length);
  const fields = parseFooterLines(footer);

  // "Auth user" is the stable reporter identity and the required marker;
  // without it this is not a user submission.
  const authUserId = fields.get("auth user");
  if (!authUserId) return null;

  return {
    number: item.number,
    kind: item.type,
    title: stripTitlePrefix(item.title),
    body,
    reporter: fields.get("reporter") ?? null,
    role: fields.get("role") ?? null,
    authUserId,
    pageUrl: fields.get("page") ?? null,
    status: item.status,
    priority: item.priority ?? null,
    createdAt: item.createdAt,
    closedAt: item.closedAt ?? null,
  };
}

// Parse + filter a project's items down to user-submitted feedback,
// newest first.
export function extractFeedback(items: Item[]): FeedbackItem[] {
  return items
    .map(parseFeedbackItem)
    .filter((f): f is FeedbackItem => f !== null)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
