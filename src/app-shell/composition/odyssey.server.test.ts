import { beforeEach, describe, expect, it, vi } from "vitest";
import { err, ok } from "@/shared/lib/result";

vi.mock("server-only", () => ({}));
vi.mock("@/features/admin/server", () => ({ FirestoreAuditLog: class {} }));
vi.mock("@/shared/lib/firebase/admin", () => ({ getAdminFirestore: () => { throw new Error("not in this test"); } }));
const missions = { missionSource: { list: vi.fn() }, missionDeps: { completions: { listFor: vi.fn() } } };
vi.mock("./missions.server", () => missions);
vi.mock("./quadrants.server", () => ({ galaxyDeps: {} }));
const quadrants = { getGalaxyMap: vi.fn() };
vi.mock("@/features/quadrants/server", () => quadrants);

const { odysseyAdminDeps, odysseyDeps } = await import("./odyssey.server");

const row = (missionId: string, status: string) => ({ uid: "u1", missionId, status, attempts: 0, xpEarned: 0, at: new Date(0) });

describe("odyssey composition", () => {
  beforeEach(() => vi.resetAllMocks());

  it("counts only completed missions as opening transmissions", async () => {
    missions.missionDeps.completions.listFor.mockResolvedValue(ok([row("a-done", "completed"), row("b-failed", "failed"), row("c-trying", "in-progress")]));

    const result = await odysseyDeps.progress.completedIds("u1");

    expect(result.ok && [...result.value]).toEqual(["a-done"]);
    expect(missions.missionDeps.completions.listFor).toHaveBeenCalledWith("u1");
  });

  it("names missions from the edition's own, or the bundled ones while it has none", async () => {
    missions.missionSource.list.mockResolvedValueOnce(ok([{ id: "own-1", title: "Propia" }]));
    const own = await odysseyDeps.progress.titles();
    expect(own.ok && [...own.value]).toEqual([["own-1", "Propia"]]);

    missions.missionSource.list.mockResolvedValueOnce(ok([]));
    const bundled = await odysseyDeps.progress.titles();
    expect(bundled.ok && bundled.value.get("ai-stand")).toBe("Visita el stand de AI");
  });

  it("knows the edition's active quadrants and missions for the admin, and reports failed reads", async () => {
    quadrants.getGalaxyMap.mockResolvedValueOnce(ok({ quadrants: [{ id: "ai" }] }));
    missions.missionSource.list.mockResolvedValueOnce(ok([{ id: "own-1", title: "Propia" }]));

    const quadrantIds = await odysseyAdminDeps.directory.activeQuadrantIds();
    const missionIds = await odysseyAdminDeps.directory.missionIds();
    expect(quadrantIds.ok && [...quadrantIds.value]).toEqual(["ai"]);
    expect(missionIds.ok && [...missionIds.value]).toEqual(["own-1"]);

    quadrants.getGalaxyMap.mockResolvedValueOnce(err({ code: "x" }));
    missions.missionSource.list.mockResolvedValueOnce(err({ code: "x" }));
    missions.missionDeps.completions.listFor.mockResolvedValueOnce(err({ code: "x" }));
    expect(await odysseyAdminDeps.directory.activeQuadrantIds()).toEqual(err({ code: "unknown" }));
    expect(await odysseyAdminDeps.directory.missionIds()).toEqual(err({ code: "unknown" }));
    expect(await odysseyDeps.progress.completedIds("u1")).toEqual(err({ code: "unknown" }));
  });
});
