import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/app-shell/composition/checkpoint-admin.server", () => ({ checkpointAdminDeps: { marker: "checkpoints" } }));
vi.mock("@/features/admin/server", () => ({ FirestoreAuditLog: class {} }));
const checkpoints = { createCheckpoint: vi.fn() };
vi.mock("@/features/checkpoints/server", () => checkpoints);
vi.mock("@/features/quadrants/server", () => ({ DEFAULT_QUADRANTS: [], DEFAULT_VENUE: { width: 10, height: 10, areas: [] }, FirestoreQuadrantStore: class {} }));

const { quadrantAdminDeps } = await import("./quadrant-admin.server");

const ADMIN = { uid: "a1", role: "admin" } as const;

describe("stand checkpoints", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("creates each stand's printed-QR checkpoint through the checkpoints feature, keeping existing ones", async () => {
    checkpoints.createCheckpoint
      .mockResolvedValueOnce({ ok: true, value: {} })
      .mockResolvedValueOnce({ ok: false, error: { code: "already-exists" } })
      .mockResolvedValueOnce({ ok: false, error: { code: "invalid-name" } });

    const result = await quadrantAdminDeps.stands.ensure(ADMIN, [
      { id: "stand-a", name: "Stand A" },
      { id: "stand-b", name: "Stand B" },
      { id: "stand-c", name: "C" },
    ]);

    expect(result).toEqual({ created: ["stand-a"], failed: ["stand-c"] });
    expect(checkpoints.createCheckpoint).toHaveBeenCalledWith({ marker: "checkpoints" }, ADMIN, { id: "stand-a", name: "Stand A", kind: "stand" });
    expect(console.error).toHaveBeenCalledTimes(1);
  });
});
