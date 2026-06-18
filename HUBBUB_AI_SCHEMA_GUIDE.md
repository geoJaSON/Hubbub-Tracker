# Hubbub — AI Assistant Integration Guide

A reference you can hand to any AI assistant (or script) so it can create
TODOs / items in Hubbub via the HTTP API. Everything here is current as of the
live schema and routes.

---

## 1. Base URL

The API is served under the `/api` prefix on the same origin as the app.

| Environment | Base URL |
| --- | --- |
| Production | `https://YOUR-DOMAIN/api` (e.g. `https://hubbub.372geo.com/api`) |
| Local dev | `http://localhost:8080/api` (API direct), or `http://localhost:5173/api` via the Vite proxy |

All paths below are relative to the base URL, e.g. the full URL to create an
item is `https://YOUR-DOMAIN/api/projects/{slug}/items`.

---

## 2. Authentication

Every endpoint (except `/api/healthz`) requires a **Bearer token**:

```
Authorization: Bearer <TOKEN>
Content-Type: application/json
```

Two kinds of token are accepted:

### A. API key — recommended for assistants / automation

A long-lived, revocable key that acts as a specific user. Create one in the app
under **Admin → Users → KEYS** (an admin can mint a key for any user — e.g. a
dedicated `ai-bot` service account). The key is shown **once** at creation, so
store it securely. It looks like `hbk_…`:

```
Authorization: Bearer hbk_xxxxxxxxxxxxxxxxxxxxxxxx
```

This is the right choice for unattended use: it doesn't expire (unless you set an
expiry) and can be revoked anytime from the same screen.

### B. Session token (JWT) — fine for quick tests

A 7-day token from logging in:

```bash
curl -s https://YOUR-DOMAIN/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"you@example.com","password":"YOUR_PASSWORD"}'
# → {"token":"eyJ...","user":{...}}
```

Use the returned `token` as the Bearer value.

### Authorization rules (enforced server-side, in order)
1. The token (API key or JWT) must resolve to an existing, **active** user.
2. For any `/projects/{slug}/...` route, that user must be a **member** of the
   project — add the service account as a member of each project it manages.
3. Admin-only routes require the user's role to be `admin`.

---

## 3. Create a TODO / item

**`POST /api/projects/{slug}/items`**

`{slug}` is the project's slug (e.g. `big-dog-roofing`). See §5 to discover
slugs and IDs.

### Request body

| Field | Type | Required | Default | Allowed values / notes |
| --- | --- | --- | --- | --- |
| `type` | string (enum) | **Yes** | — | `todo`, `bug`, `request`, `decision` |
| `title` | string | **Yes** | — | Short summary |
| `description` | string | No | `null` | Longer body / details |
| `status` | string (enum) | No | `open` | `open`, `in_progress`, `blocked`, `done`, `cancelled` |
| `priority` | string (enum) | No | `medium` | `low`, `medium`, `high`, `urgent` |
| `category` | string (enum) | No | `null` | See category list below |
| `assigneeId` | string | No | `null` | A user ID / `clerkId` (see §5 members) |
| `scopeId` | integer | No | `null` | Foreign key → a scope in the project |
| `milestoneId` | integer | No | `null` | Foreign key → a milestone in the project |
| `componentId` | integer | No | `null` | Foreign key → a project component |
| `estimateMinutes` | integer | No | `null` | Time estimate in minutes |
| `dueDate` | string (date) | No | `null` | `YYYY-MM-DD` |
| `decisionRationale` | string | No | `null` | Only meaningful when `type` = `decision` |

**Category enum values:**
`infrastructure_hosting`, `security_compliance`, `mobile_devops`,
`web_devops`, `database_schema`, `monitoring_observability`,
`deployment_release`, `third_party_integration`, `support_operations`

> The server auto-assigns the per-project item `number` and `createdAt`, and
> logs an activity event. For `type: "decision"` it also logs a decision event.

### Minimal example (only required fields)

```json
{
  "type": "todo",
  "title": "Replace the roof flashing on the north side"
}
```

### Full example

```json
{
  "type": "todo",
  "title": "Add rate limiting to the public API",
  "description": "Protect /api endpoints from abuse before launch.",
  "status": "open",
  "priority": "high",
  "category": "security_compliance",
  "estimateMinutes": 120,
  "dueDate": "2026-06-15"
}
```

### Response

`200 OK` with the created item as JSON, including its generated `id` and
project-scoped `number`.

---

## 4. Examples

### curl

```bash
curl -X POST \
  "https://YOUR-DOMAIN/api/projects/big-dog-roofing/items" \
  -H "Authorization: Bearer $HUBBUB_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "todo",
    "title": "Order replacement shingles",
    "priority": "high",
    "dueDate": "2026-06-10"
  }'
```

### JavaScript (fetch)

```js
async function pushTodo(slug, todo, token) {
  const res = await fetch(
    `https://YOUR-DOMAIN/api/projects/${slug}/items`,
    {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(todo),
    },
  );
  if (!res.ok) throw new Error(`Hubbub API ${res.status}: ${await res.text()}`);
  return res.json();
}

await pushTodo(
  "big-dog-roofing",
  { type: "todo", title: "Schedule inspection", priority: "medium" },
  process.env.HUBBUB_TOKEN,
);
```

### Python (requests)

```python
import requests

def push_todo(slug, todo, token):
    r = requests.post(
        f"https://YOUR-DOMAIN/api/projects/{slug}/items",
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        },
        json=todo,
        timeout=15,
    )
    r.raise_for_status()
    return r.json()

push_todo(
    "big-dog-roofing",
    {"type": "todo", "title": "Call supplier", "priority": "low"},
    HUBBUB_TOKEN,
)
```

---

## 5. Discovery endpoints (to resolve slugs & IDs)

All require the same `Authorization: Bearer` header. Use these so your
assistant can fill in `scopeId`, `milestoneId`, `componentId`, or `assigneeId`.

| Purpose | Method & path |
| --- | --- |
| List projects you can access (gives `slug`) | `GET /api/projects` |
| Get one project's details | `GET /api/projects/{slug}` |
| List project members (gives user IDs for `assigneeId`) | `GET /api/projects/{slug}/members` |
| List scopes (gives `scopeId`) | `GET /api/projects/{slug}/scopes` |
| List milestones (gives `milestoneId`) | `GET /api/projects/{slug}/milestones` |
| List components (gives `componentId`) | `GET /api/projects/{slug}/components` |
| List existing items | `GET /api/projects/{slug}/items` |

**Recommended assistant flow:**
1. `GET /api/projects` → pick the project `slug`.
2. (Optional) `GET .../scopes`, `.../milestones`, `.../components`,
   `.../members` to map human names to IDs.
3. `POST /api/projects/{slug}/items` with the body from §3.

---

## 6. Errors

| Status | Meaning |
| --- | --- |
| `401 Unauthorized` | Missing/expired token, or user not provisioned in Hubbub |
| `403 Forbidden` | Authenticated but not a member of the project |
| `404 Not Found` | Project slug doesn't exist |
| `400 / 500` | Bad/invalid body (e.g. an enum value not in the allowed list) |

Always send valid enum values exactly as listed — anything else will be
rejected by the database.
