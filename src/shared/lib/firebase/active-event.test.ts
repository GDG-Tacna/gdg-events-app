import type { Firestore } from "firebase-admin/firestore";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("./admin", () => ({ getAdminFirestore: () => { throw new Error("must be injected"); } }));

const { createActiveEventResolver, getActiveEventId, runInEdition, setRequestEditionSource } = await import("./active-event");

function dbWith(config: Record<string, unknown> | undefined, onRead: () => void = () => undefined) {
  return {
    collection: (name: string) => ({
      doc: (id: string) => ({
        get: async () => {
          onRead();
          expect(`${name}/${id}`).toBe("config/app");
          return { exists: config !== undefined, data: () => config };
        },
      }),
    }),
  } as unknown as Firestore;
}

describe("active event resolver", () => {
  it("serves the edition named in config/app", async () => {
    const resolve = createActiveEventResolver({ getDb: () => dbWith({ activeEventId: "devfest-2027" }) });

    expect(await resolve()).toBe("devfest-2027");
  });

  it("falls back to the edition's default when the database has no config yet", async () => {
    const resolve = createActiveEventResolver({ getDb: () => dbWith(undefined), fallbackId: "devfest-2026" });

    expect(await resolve()).toBe("devfest-2026");
  });

  it("falls back when the config exists but names no edition", async () => {
    const resolve = createActiveEventResolver({ getDb: () => dbWith({}), fallbackId: "devfest-2026" });

    expect(await resolve()).toBe("devfest-2026");
  });

  it.each(["", "Bad Id", "../users", 7, null])(
    "refuses a malformed activeEventId (%j) instead of writing into a made-up edition",
    async (activeEventId) => {
      const resolve = createActiveEventResolver({ getDb: () => dbWith({ activeEventId }) });

      await expect(resolve()).rejects.toThrow("not a valid event id");
    },
  );

  it("does not fall back when the read fails: the caller reports the error", async () => {
    const resolve = createActiveEventResolver({
      getDb: () => {
        throw new Error("offline");
      },
      fallbackId: "devfest-2026",
    });

    await expect(resolve()).rejects.toThrow("offline");
  });

  it("reads once per time window, then reads again, so switching editions takes effect", async () => {
    let configured = "devfest-2026";
    let reads = 0;
    let clock = 0;
    const resolve = createActiveEventResolver({
      getDb: () => dbWith({ activeEventId: configured }, () => reads++),
      ttlMs: 60_000,
      now: () => clock,
    });

    expect(await resolve()).toBe("devfest-2026");
    configured = "devfest-2027";
    clock = 59_999;
    expect(await resolve()).toBe("devfest-2026");
    expect(reads).toBe(1);

    clock = 60_000;
    expect(await resolve()).toBe("devfest-2027");
    expect(reads).toBe(2);
  });

  it("reads again right away after forget, so publishing an edition takes effect on this server at once", async () => {
    const config = { activeEventId: "devfest-2026" };
    let reads = 0;
    const resolve = createActiveEventResolver({ getDb: () => dbWith(config, () => (reads += 1)), now: () => 0 });

    expect(await resolve()).toBe("devfest-2026");
    config.activeEventId = "meetup-nov";
    expect(await resolve()).toBe("devfest-2026");
    resolve.forget();
    expect(await resolve()).toBe("meetup-nov");
    expect(reads).toBe(2);
  });

  it("prefers an edition named for the work, then the request's checked working edition", async () => {
    setRequestEditionSource(async () => "meetup-nov");
    try {
      expect(await getActiveEventId()).toBe("meetup-nov");
      expect(await runInEdition("taller-dic", async () => getActiveEventId())).toBe("taller-dic");
      // Nested awaits keep the named edition.
      expect(await runInEdition("taller-dic", async () => Promise.resolve().then(() => getActiveEventId()))).toBe("taller-dic");
      await expect(runInEdition("Not Valid", async () => "x")).rejects.toThrow("not a valid event id");
    } finally {
      setRequestEditionSource(null);
    }
  });
});
