import { setBaseUrl, setAuthTokenGetter } from "@workspace/api-client-react";

let _getToken: (() => Promise<string | null>) | null = null;

export function initApiClient(getToken: () => Promise<string | null>) {
  _getToken = getToken;
  setAuthTokenGetter(async () => {
    if (!_getToken) return null;
    return _getToken();
  });
  setBaseUrl(null);
}

async function authHeaders(): Promise<Record<string, string>> {
  const token = _getToken ? await _getToken() : null;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// ── API keys ────────────────────────────────────────────────────────────────
// Hand-written (the generated client is OpenAPI-driven; these routes live
// outside the spec). All same-origin /api — works in prod and via the dev proxy.
export interface ApiKey {
  id: number;
  name: string;
  prefix: string;
  userId: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
  revoked: boolean;
  createdAt: string;
}

async function jsonHeaders(): Promise<Record<string, string>> {
  return { ...(await authHeaders()), "Content-Type": "application/json" };
}

export async function listApiKeys(userId?: string): Promise<ApiKey[]> {
  const q = userId ? `?userId=${encodeURIComponent(userId)}` : "";
  const res = await fetch(`/api/api-keys${q}`, { headers: await authHeaders() });
  if (!res.ok) throw new Error(`Failed to list API keys (${res.status})`);
  return res.json() as Promise<ApiKey[]>;
}

// Returns the created key including its plaintext `key` — shown to the user once.
export async function createApiKey(params: {
  name: string;
  userId?: string;
  expiresInDays?: number;
}): Promise<ApiKey & { key: string }> {
  const res = await fetch(`/api/api-keys`, {
    method: "POST",
    headers: await jsonHeaders(),
    body: JSON.stringify(params),
  });
  if (!res.ok) throw new Error(`Failed to create API key (${res.status})`);
  return res.json() as Promise<ApiKey & { key: string }>;
}

export async function revokeApiKey(id: number): Promise<void> {
  const res = await fetch(`/api/api-keys/${id}`, {
    method: "DELETE",
    headers: await authHeaders(),
  });
  if (!res.ok) throw new Error(`Failed to revoke API key (${res.status})`);
}

export type AttachmentEntityType = "item" | "comment" | "scope" | "message";

// Uploads go through a hand-written multipart fetch (the generated client only
// models JSON bodies). Same-origin /api works in prod and via the dev proxy.
export async function uploadAttachment(params: {
  slug: string;
  entityType: AttachmentEntityType;
  entityId: number;
  file: File;
}): Promise<void> {
  const form = new FormData();
  form.append("file", params.file);
  form.append("entityType", params.entityType);
  form.append("entityId", String(params.entityId));

  const res = await fetch(`/api/projects/${params.slug}/attachments`, {
    method: "POST",
    headers: await authHeaders(),
    body: form,
  });
  if (!res.ok) {
    let message = `Upload failed (${res.status})`;
    try {
      const data = (await res.json()) as { message?: string; error?: string };
      message = data.message ?? data.error ?? message;
    } catch {
      /* non-JSON error body */
    }
    throw new Error(message);
  }
}

// Downloads as a blob so the bearer token is sent (a plain <a download> can't).
export async function downloadAttachment(
  slug: string,
  id: number,
  filename: string,
): Promise<void> {
  const res = await fetch(`/api/projects/${slug}/attachments/${id}/download`, {
    headers: await authHeaders(),
  });
  if (!res.ok) throw new Error(`Download failed (${res.status})`);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
