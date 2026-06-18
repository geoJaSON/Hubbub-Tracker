import { createReadStream } from "node:fs";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";

// Pluggable blob storage. LocalDiskStorage is the default; an S3/MinIO backend
// can be added later behind the same interface (select via STORAGE_BACKEND).
export interface StorageBackend {
  readonly name: string;
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  getStream(key: string): Promise<NodeJS.ReadableStream>;
  delete(key: string): Promise<void>;
}

class LocalDiskStorage implements StorageBackend {
  readonly name = "local";
  private readonly root: string;

  constructor(root: string) {
    this.root = resolve(root);
  }

  // Keys are server-generated, but never let one escape the storage root.
  private resolveKey(key: string): string {
    const full = resolve(this.root, key);
    if (full !== this.root && !full.startsWith(this.root + sep)) {
      throw new Error("Invalid storage key");
    }
    return full;
  }

  async put(key: string, body: Buffer): Promise<void> {
    const full = this.resolveKey(key);
    await mkdir(dirname(full), { recursive: true });
    await writeFile(full, body);
  }

  async getStream(key: string): Promise<NodeJS.ReadableStream> {
    return createReadStream(this.resolveKey(key));
  }

  async delete(key: string): Promise<void> {
    await unlink(this.resolveKey(key)).catch(() => {});
  }
}

let storage: StorageBackend | null = null;

export function getStorage(): StorageBackend {
  if (storage) return storage;
  // Future: if (process.env.STORAGE_BACKEND === "s3") storage = new S3Storage();
  storage = new LocalDiskStorage(process.env.UPLOADS_DIR ?? "./.uploads");
  return storage;
}
