import "server-only";
import { ok, type Result } from "@/shared/lib/result";
import type { ImageStore } from "../../domain/image";

type Stored = { bytes: Uint8Array; contentType: string };

/**
 * Keeps the images read most recently in this server's memory, up to a byte budget (the oldest leave first). An
 * image never changes (each upload gets a new name), so nothing goes stale; a removed one leaves the cache at once.
 * Failed reads and missing images are never kept.
 */
export class CachedImageStore implements ImageStore {
  private readonly entries = new Map<string, Stored>();
  private bytes = 0;

  constructor(
    private readonly store: ImageStore,
    private readonly maxBytes = 32 * 1024 * 1024,
  ) {}

  put(path: string, bytes: Uint8Array, contentType: string) {
    return this.store.put(path, bytes, contentType);
  }

  async get(path: string): Promise<Result<Stored | null, { code: string }>> {
    const hit = this.entries.get(path);
    if (hit) {
      // Most recently used goes last.
      this.entries.delete(path);
      this.entries.set(path, hit);
      return ok(hit);
    }
    const read = await this.store.get(path);
    if (read.ok && read.value && read.value.bytes.length <= this.maxBytes) {
      this.entries.set(path, read.value);
      this.bytes += read.value.bytes.length;
      for (const [oldest, stored] of this.entries) {
        if (this.bytes <= this.maxBytes) break;
        this.entries.delete(oldest);
        this.bytes -= stored.bytes.length;
      }
    }
    return read;
  }

  async remove(path: string) {
    const kept = this.entries.get(path);
    if (kept) {
      this.entries.delete(path);
      this.bytes -= kept.bytes.length;
    }
    return this.store.remove(path);
  }
}
