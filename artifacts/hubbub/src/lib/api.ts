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

// ── Labels ──────────────────────────────────────────────────────────────────
export interface ProjectLabel {
  id: number;
  projectId: number;
  name: string;
  color: string;
  createdAt: string;
}

export async function listLabels(slug: string): Promise<ProjectLabel[]> {
  const res = await fetch(`/api/projects/${slug}/labels`, { headers: await authHeaders() });
  if (!res.ok) throw new Error(`Failed to list labels (${res.status})`);
  return res.json() as Promise<ProjectLabel[]>;
}

export async function createLabel(slug: string, name: string, color: string): Promise<ProjectLabel> {
  const res = await fetch(`/api/projects/${slug}/labels`, {
    method: "POST",
    headers: await jsonHeaders(),
    body: JSON.stringify({ name, color }),
  });
  if (!res.ok) throw new Error(`Failed to create label (${res.status})`);
  return res.json() as Promise<ProjectLabel>;
}

export async function deleteLabel(slug: string, labelId: number): Promise<void> {
  const res = await fetch(`/api/projects/${slug}/labels/${labelId}`, {
    method: "DELETE",
    headers: await authHeaders(),
  });
  if (!res.ok) throw new Error(`Failed to delete label (${res.status})`);
}

// Replace the full set of labels applied to an item.
export async function setItemLabels(slug: string, itemNumber: number, labelIds: number[]): Promise<void> {
  const res = await fetch(`/api/projects/${slug}/items/${itemNumber}`, {
    method: "PATCH",
    headers: await jsonHeaders(),
    body: JSON.stringify({ labelIds }),
  });
  if (!res.ok) throw new Error(`Failed to update item labels (${res.status})`);
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

// ── Testing (per-project manual test plan) ────────────────────────────────────
// Hand-written (these routes live outside the OpenAPI spec). Same-origin /api —
// works in prod and via the dev proxy.
export type TestRunResult = "pass" | "fail" | "skip" | "blocked";
export type TestCaseStatus = TestRunResult | "untested";

export interface TestRun {
  id: number;
  caseId: number;
  result: TestRunResult;
  device: string | null;
  note: string | null;
  testedAt: string;
  createdById: string | null;
  createdAt: string;
}

export interface TestCase {
  id: number;
  suiteId: number;
  code: string | null;
  title: string;
  expected: string | null;
  owner: string | null;
  order: number;
  createdAt: string;
  updatedAt: string;
  // Derived server-side from the case's runs.
  runs: TestRun[];
  currentStatus: TestCaseStatus;
  lastTestedAt: string | null;
  devices: string[];
}

export interface TestSuite {
  id: number;
  projectId: number;
  code: string | null;
  title: string;
  warn: boolean;
  order: number;
  createdAt: string;
  cases: TestCase[];
}

export interface TestPlan {
  suites: TestSuite[];
}

// Shape accepted by importTestPlan / used for the starter seed.
export interface TestPlanImport {
  suites: Array<{
    code?: string;
    title: string;
    warn?: boolean;
    cases: Array<{ code?: string; title: string; expected?: string; owner?: string }>;
  }>;
}

async function okJson<T>(res: Response, action: string): Promise<T> {
  if (!res.ok) throw new Error(`${action} (${res.status})`);
  return res.json() as Promise<T>;
}

export async function getTestPlan(slug: string): Promise<TestPlan> {
  const res = await fetch(`/api/projects/${slug}/testing`, { headers: await authHeaders() });
  return okJson<TestPlan>(res, "Failed to load test plan");
}

export async function importTestPlan(
  slug: string,
  plan: TestPlanImport,
): Promise<{ ok: boolean; suites: number; cases: number }> {
  const res = await fetch(`/api/projects/${slug}/testing/import`, {
    method: "POST",
    headers: await jsonHeaders(),
    body: JSON.stringify(plan),
  });
  return okJson(res, "Failed to import test plan");
}

// ── Suites ─────────────────────────────────────────────────────────────────
export async function createTestSuite(
  slug: string,
  input: { title: string; code?: string; warn?: boolean },
): Promise<TestSuite> {
  const res = await fetch(`/api/projects/${slug}/testing/suites`, {
    method: "POST",
    headers: await jsonHeaders(),
    body: JSON.stringify(input),
  });
  return okJson<TestSuite>(res, "Failed to create suite");
}

export async function updateTestSuite(
  slug: string,
  suiteId: number,
  input: { title?: string; code?: string; warn?: boolean; order?: number },
): Promise<TestSuite> {
  const res = await fetch(`/api/projects/${slug}/testing/suites/${suiteId}`, {
    method: "PATCH",
    headers: await jsonHeaders(),
    body: JSON.stringify(input),
  });
  return okJson<TestSuite>(res, "Failed to update suite");
}

export async function deleteTestSuite(slug: string, suiteId: number): Promise<void> {
  const res = await fetch(`/api/projects/${slug}/testing/suites/${suiteId}`, {
    method: "DELETE",
    headers: await authHeaders(),
  });
  if (!res.ok) throw new Error(`Failed to delete suite (${res.status})`);
}

// ── Cases ──────────────────────────────────────────────────────────────────
export async function createTestCase(
  slug: string,
  suiteId: number,
  input: { title: string; code?: string; expected?: string; owner?: string },
): Promise<TestCase> {
  const res = await fetch(`/api/projects/${slug}/testing/suites/${suiteId}/cases`, {
    method: "POST",
    headers: await jsonHeaders(),
    body: JSON.stringify(input),
  });
  return okJson<TestCase>(res, "Failed to create case");
}

export async function updateTestCase(
  slug: string,
  caseId: number,
  input: {
    title?: string;
    code?: string;
    expected?: string;
    owner?: string;
    order?: number;
    suiteId?: number;
  },
): Promise<TestCase> {
  const res = await fetch(`/api/projects/${slug}/testing/cases/${caseId}`, {
    method: "PATCH",
    headers: await jsonHeaders(),
    body: JSON.stringify(input),
  });
  return okJson<TestCase>(res, "Failed to update case");
}

export async function deleteTestCase(slug: string, caseId: number): Promise<void> {
  const res = await fetch(`/api/projects/${slug}/testing/cases/${caseId}`, {
    method: "DELETE",
    headers: await authHeaders(),
  });
  if (!res.ok) throw new Error(`Failed to delete case (${res.status})`);
}

// ── Runs ───────────────────────────────────────────────────────────────────
export async function logTestRun(
  slug: string,
  caseId: number,
  input: { result: TestRunResult; device?: string; note?: string; testedAt?: string },
): Promise<TestRun> {
  const res = await fetch(`/api/projects/${slug}/testing/cases/${caseId}/runs`, {
    method: "POST",
    headers: await jsonHeaders(),
    body: JSON.stringify(input),
  });
  return okJson<TestRun>(res, "Failed to log run");
}

export async function updateTestRun(
  slug: string,
  runId: number,
  input: { result?: TestRunResult; device?: string; note?: string; testedAt?: string },
): Promise<TestRun> {
  const res = await fetch(`/api/projects/${slug}/testing/runs/${runId}`, {
    method: "PATCH",
    headers: await jsonHeaders(),
    body: JSON.stringify(input),
  });
  return okJson<TestRun>(res, "Failed to update run");
}

export async function deleteTestRun(slug: string, runId: number): Promise<void> {
  const res = await fetch(`/api/projects/${slug}/testing/runs/${runId}`, {
    method: "DELETE",
    headers: await authHeaders(),
  });
  if (!res.ok) throw new Error(`Failed to delete run (${res.status})`);
}
