import type { Firestore } from "firebase-admin/firestore";
import { describe, expect, it, vi } from "vitest";
import { err, ok, type Result } from "@/shared/lib/result";
import { testEventResolver, withEventScope } from "@/test-utils/firestore-paths";
import type { Mission } from "../../domain/mission";

vi.mock("server-only", () => ({}));
vi.mock("@/shared/lib/firebase/admin", () => ({ getAdminFirestore: () => { throw new Error("must be injected"); } }));

const { FirestoreMissionSource } = await import("./firestore-mission-source");
const { CachedMissionSource } = await import("./cached-mission-source");

const db = (docs: Record<string, Record<string, unknown>>) =>
  ({
    collection: withEventScope((name: string) => ({
      get: async () => ({
        docs: Object.entries(docs)
          .filter(([key]) => key.startsWith(`${name}/`))
          .map(([key, data]) => ({ id: key.split("/").pop()!, data: () => data })),
      }),
    })),
  }) as unknown as Firestore;

const MISSION = { title: "Visita", description: "", quadrantId: "ai", xp: 30, order: 0, active: true, config: { type: "stand", checkpointId: "stand-ai-1" } };

describe("FirestoreMissionSource", () => {
  it("reads the edition's missions and skips (and logs) those that cannot be offered", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const source = new FirestoreMissionSource(
      () => db({ "events/e1/missions/ai-stand": MISSION, "events/e1/missions/broken": { ...MISSION, xp: 0 }, "events/e2/missions/other": MISSION }),
      testEventResolver,
    );

    const result = await source.list();

    expect(result.ok && result.value.map((m) => m.id)).toEqual(["ai-stand"]);
    expect(log).toHaveBeenCalled();
  });

  it("reports a failed read", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const source = new FirestoreMissionSource(() => ({ collection: () => { throw new Error("offline"); } }) as unknown as Firestore, testEventResolver);

    expect(await source.list()).toEqual(err({ code: "unknown" }));
  });
});

describe("CachedMissionSource", () => {
  function setup() {
    const clock = { now: 0 };
    const inner = { list: vi.fn(async (): Promise<Result<readonly Mission[], { code: string }>> => ok([])) };
    return { clock, inner, source: new CachedMissionSource(inner, { ttlMs: 60_000, now: () => clock.now }) };
  }

  it("reads once a minute, and again right away after an admin change", async () => {
    const { source, inner, clock } = setup();

    await source.list();
    clock.now = 59_999;
    await source.list();
    expect(inner.list).toHaveBeenCalledTimes(1);

    source.invalidate();
    await source.list();
    clock.now = 200_000;
    await source.list();
    expect(inner.list).toHaveBeenCalledTimes(3);
  });

  it("never caches a failure", async () => {
    const { source, inner } = setup();
    inner.list.mockResolvedValueOnce(err({ code: "unknown" }));

    expect(await source.list()).toEqual(err({ code: "unknown" }));
    expect(await source.list()).toEqual(ok([]));
  });
});
