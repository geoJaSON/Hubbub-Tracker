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
