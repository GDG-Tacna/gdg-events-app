import type { Firestore } from "firebase-admin/firestore";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/shared/lib/firebase/admin", () => ({ getAdminFirestore: () => { throw new Error("must be injected"); } }));

const { FirestoreAuditLog } = await import("./firestore-audit-log");

const entry = {
  action: "role.granted",
  actorUid: "admin-1",
  targetUid: "u1",
  details: { role: "staff", previous: null },
  at: new Date("2026-10-20T14:00:00Z"),
} as const;

describe("FirestoreAuditLog", () => {
  it("appends the entry to the audit collection, with a generated id", async () => {
    const added: Array<{ collection: string; data: unknown }> = [];
    const db = {
      collection: (collection: string) => ({
        add: async (data: unknown) => {
          added.push({ collection, data });
        },
      }),
    } as unknown as Firestore;

    const result = await new FirestoreAuditLog(() => db).append(entry);

    expect(result).toEqual({ ok: true, value: undefined });
    expect(added).toEqual([{ collection: "audit", data: entry }]);
  });

  it("reports a failed write as an error", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const db = {
      collection: () => ({
        add: async () => {
          throw new Error("boom");
        },
      }),
    } as unknown as Firestore;

    expect(await new FirestoreAuditLog(() => db).append(entry)).toEqual({ ok: false, error: { code: "unknown" } });
  });
});
