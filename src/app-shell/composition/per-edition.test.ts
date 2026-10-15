import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/features/event/server", () => ({ currentEditionOf: async () => "devfest-2026" }));

const { perEdition } = await import("./per-edition");

class Counter {
  reads = 0;
  invalidated = 0;
  constructor(readonly label: string) {}
  async read(prefix: string) {
    this.reads += 1;
    return `${prefix}:${this.label}`;
  }
  invalidate() {
    this.invalidated += 1;
  }
}

describe("perEdition", () => {
  it("keeps one copy per edition and sends each call to the request's edition", async () => {
    let edition = "devfest-2026";
    const made: Counter[] = [];
    const cache = perEdition(() => {
      const copy = new Counter(`copy${made.length + 1}`);
      made.push(copy);
      return copy;
    }, async () => edition);

    expect(await cache.read("a")).toBe("a:copy1");
    expect(await cache.read("b")).toBe("b:copy1");
    edition = "meetup-nov";
    expect(await cache.read("c")).toBe("c:copy2");
    edition = "devfest-2026";
    expect(await cache.read("d")).toBe("d:copy1");
    expect(made.map((copy) => copy.reads)).toEqual([3, 1]);
  });

  it("drops every edition's copy on invalidate", async () => {
    let edition = "devfest-2026";
    const made: Counter[] = [];
    const cache = perEdition(() => {
      const copy = new Counter("x");
      made.push(copy);
      return copy;
    }, async () => edition);
    await cache.read("a");
    edition = "meetup-nov";
    await cache.read("b");

    cache.invalidate();

    expect(made.map((copy) => copy.invalidated)).toEqual([1, 1]);
  });

  it("is never mistaken for a promise", async () => {
    const cache = perEdition(() => new Counter("x"));

    expect((cache as unknown as { then?: unknown }).then).toBeUndefined();
    await expect(Promise.resolve(cache)).resolves.toBe(cache);
  });
});

describe("dropEditionCaches", () => {
  it("makes every cache build a fresh copy for that edition only", async () => {
    const { dropEditionCaches } = await import("./per-edition");
    let edition = "meetup-nov";
    let made = 0;
    const cache = perEdition(() => new Counter(`copy${(made += 1)}`), async () => edition);
    await cache.read("a");
    edition = "devfest-2026";
    await cache.read("b");

    dropEditionCaches("meetup-nov");
    edition = "meetup-nov";

    expect(await cache.read("c")).toBe("c:copy3");
    edition = "devfest-2026";
    expect(await cache.read("d")).toBe("d:copy2");
  });
});
