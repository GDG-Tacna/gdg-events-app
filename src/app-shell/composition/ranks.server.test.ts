import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/features/admin/server", () => ({ FirestoreAuditLog: class {} }));
vi.mock("@/shared/lib/firebase/admin", () => ({ getAdminFirestore: () => { throw new Error("not in this test"); } }));
vi.mock("./media.server", () => ({ recordImages: { ref: () => null, remove: async () => {} } }));

const { rankDeps } = await import("./ranks.server");

describe("rank composition", () => {
  it("offers the bundled ladder with the names attendees already know", () => {
    expect(rankDeps.defaults.map(({ id, name, minXp, level }) => ({ id, name, minXp, level }))).toEqual([
      { id: "recruit", name: "Recluta", minXp: 0, level: 1 },
      { id: "pilot", name: "Piloto", minXp: 100, level: 2 },
      { id: "commander", name: "Comandante", minXp: 500, level: 3 },
      { id: "stellar-legend", name: "Leyenda Estelar", minXp: 2000, level: 4 },
    ]);
  });
});
