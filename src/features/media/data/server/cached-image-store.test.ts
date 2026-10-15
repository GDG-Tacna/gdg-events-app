import { describe, expect, it, vi } from "vitest";
import { err, ok, type Result } from "@/shared/lib/result";

vi.mock("server-only", () => ({}));

const { CachedImageStore } = await import("./cached-image-store");

const image = (size: number) => ({ bytes: new Uint8Array(size), contentType: "image/webp" });

function setup(maxBytes = 100) {
  const inner = {
    put: vi.fn(async () => ok({ url: "/media/x" })),
    get: vi.fn(async (path: string): Promise<Result<ReturnType<typeof image> | null, { code: string }>> => ok(path.startsWith("missing") ? null : image(Number(path.split("-")[1])))),
    remove: vi.fn(async () => ok(undefined)),
  };
  return { inner, cached: new CachedImageStore(inner, maxBytes) };
}

describe("CachedImageStore", () => {
  it("reads an image once and serves it from memory after that", async () => {
    const { inner, cached } = setup();

    await cached.get("a-10");
    await cached.get("a-10");

    expect(inner.get).toHaveBeenCalledTimes(1);
  });

  it("drops the least recently used images to stay within its budget", async () => {
    const { inner, cached } = setup(100);

    await cached.get("a-40");
    await cached.get("b-40");
    await cached.get("a-40"); // a is now the most recent
    await cached.get("c-40"); // over budget: b leaves
    await cached.get("a-40");
    await cached.get("b-40");

    expect(inner.get.mock.calls.map(([path]) => path)).toEqual(["a-40", "b-40", "c-40", "b-40"]);
  });

  it("never keeps a missing image, a failed read, or one larger than the whole budget", async () => {
    const { inner, cached } = setup(100);
    inner.get.mockResolvedValueOnce(err({ code: "unknown" }));

    await cached.get("a-10");
    await cached.get("a-10");
    await cached.get("missing-1");
    await cached.get("missing-1");
    await cached.get("big-500");
    await cached.get("big-500");

    expect(inner.get).toHaveBeenCalledTimes(6);
  });

  it("forgets a removed image at once", async () => {
    const { inner, cached } = setup();
    await cached.get("a-10");

    await cached.remove("a-10");
    await cached.get("a-10");

    expect(inner.remove).toHaveBeenCalledWith("a-10");
    expect(inner.get).toHaveBeenCalledTimes(2);
  });
});
