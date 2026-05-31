# Hubbub — AI Assistant Integration Guide

A reference you can hand to any AI assistant (or script) so it can create
TODOs / items in Hubbub via the HTTP API. Everything here is current as of the
live schema and routes.

---

## 1. Base URL

The API is served under the `/api` prefix on the same domain as the app.

| Environment | Base URL |
| --- | --- |
| Production (published) | `https://YOUR-DEPLOYED-DOMAIN/api` |
| Development | `https://9b766254-6b69-434b-8d70-260d4fd989b9-00-22m43aml1idwg.picard.replit.dev/api` |

Replace `YOUR-DEPLOYED-DOMAIN` with your actual `.replit.app` (or custom)
domain. All paths below are relative to the base URL, e.g. the full URL to
create an item is:

```
https://YOUR-DEPLOYED-DOMAIN/api/projects/{slug}/items
```

---

## 2. Authentication

Every endpoint (except `/api/healthz`) requires a **Clerk session token** sent
as a Bearer header:

```
Authorization: Bearer <CLERK_SESSION_TOKEN>
Content-Type: application/json
```

Rules enforced server-side, in order:
1. The token must be a valid Clerk session for a signed-in user.
2. That user must already exist in Hubbub (i.e. you have logged in at least
   once with that `@372geomedia.com` account).
3. For any `/projects/{slug}/...` route, the user must be a **member** of that
   project.

### How to get a token (quick method, for testing)
1. Open Hubbub in your browser and log in.
2. Open DevTools → Console and run:
   ```js
   await window.Clerk.session.getToken()
   ```
3. Copy the printed JWT and use it as the Bearer token.

> ⚠️ **Token expiry:** Clerk session tokens are short-lived (they refresh
> automatically in the browser, but a copied token expires within ~1 minute by
> default). This is fine for one-off pushes and testing. If you want your AI
> assistant to run unattended over time, ask the Hubbub maintainer to add a
> long-lived API-key mechanism — the current auth is browser-session based.

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
| `assigneeId` | string | No | `null` | A Clerk user ID (see §5 members) |
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
  "https://YOUR-DEPLOYED-DOMAIN/api/projects/big-dog-roofing/items" \
  -H "Authorization: Bearer $CLERK_TOKEN" \
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
    `https://YOUR-DEPLOYED-DOMAIN/api/projects/${slug}/items`,
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
  process.env.CLERK_TOKEN,
);
```

### Python (requests)

```python
import requests

def push_todo(slug, todo, token):
    r = requests.post(
        f"https://YOUR-DEPLOYED-DOMAIN/api/projects/{slug}/items",
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
    CLERK_TOKEN,
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
| List project members (gives Clerk user IDs for `assigneeId`) | `GET /api/projects/{slug}/members` |
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
