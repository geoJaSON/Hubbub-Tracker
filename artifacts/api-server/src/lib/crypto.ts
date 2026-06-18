import { createCipheriv, createDecipheriv, randomBytes, createHash } from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;
const TAG_BYTES = 16;
const ENCODING = "base64url";

function getKey(): Buffer | null {
  const raw = process.env["ENCRYPTION_KEY"];
  if (!raw) return null;
  return createHash("sha256").update(raw).digest();
}

/**
 * Encrypt a plaintext string using AES-256-GCM.
 * Returns a base64url-encoded string: iv + ciphertext + authTag.
 * Returns null if ENCRYPTION_KEY is not set.
 */
export function encrypt(plaintext: string): string | null {
  const key = getKey();
  if (!key) return null;

  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, encrypted, tag]).toString(ENCODING);
}

// ── API keys ──────────────────────────────────────────────────────────────────
// API keys are random bearer tokens. Only the sha256 hash is persisted; the
// plaintext is shown to the caller exactly once at creation.
const API_KEY_PREFIX = "hbk_";

/** Deterministic sha256 (hex) of an API key, for storage and lookup. */
export function hashApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

/** Mint a new API key: `{ key }` is the secret (returned once), plus its stored hash and display prefix. */
export function generateApiKey(): { key: string; prefix: string; hash: string } {
  const key = API_KEY_PREFIX + randomBytes(24).toString("base64url");
  return { key, prefix: key.slice(0, 12), hash: hashApiKey(key) };
}

/**
 * Decrypt a ciphertext produced by `encrypt`.
 * Returns null if decryption fails (wrong key, corrupted data, or plain-text legacy value).
 */
export function decrypt(ciphertext: string): string | null {
  const key = getKey();
  if (!key) return null;

  try {
    const buf = Buffer.from(ciphertext, ENCODING);
    if (buf.length < IV_BYTES + TAG_BYTES + 1) return null;

    const iv = buf.subarray(0, IV_BYTES);
    const tag = buf.subarray(buf.length - TAG_BYTES);
    const encrypted = buf.subarray(IV_BYTES, buf.length - TAG_BYTES);

    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);
    return decipher.update(encrypted) + decipher.final("utf8");
  } catch {
    return null;
  }
}
