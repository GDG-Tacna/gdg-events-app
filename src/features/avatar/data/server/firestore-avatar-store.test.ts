import type { Firestore } from "firebase-admin/firestore";
import { describe, expect, it, vi } from "vitest";
import { ok } from "@/shared/lib/result";
import type { AvatarLook } from "@/shared/ui/pixel/avatar-look";

vi.mock("server-only", () => ({}));
vi.mock("@/shared/lib/firebase/admin", () => ({ getAdminFirestore: () => { throw new Error("must be injected"); } }));
vi.mock("@/shared/lib/log", () => ({ logServerError: vi.fn() }));

const { FirestoreAvatarStore } = await import("./firestore-avatar-store");

const LOOK: AvatarLook = { skin: 1, hairStyle: "curly", hairColor: 6, beard: "mustache", glasses: "none", helmet: 3, suit: 2 };
const AT = new Date("2026-10-24T15:00:00Z");

describe("FirestoreAvatarStore", () => {
  function fake(initial: Record<string, Record<string, unknown>> = {}) {
    const docs = new Map(Object.entries(initial));
    const db = {
      collection: (name: string) => ({
        doc: (id: string) => {
          const path = `${name}/${id}`;
          return {
            get: async () => ({ exists: docs.has(path), data: () => docs.get(path) }),
            set: async (data: Record<string, unknown>) => void docs.set(path, data),
            delete: async () => void docs.delete(path),
          };
        },
      }),
    };
    return { db: db as unknown as Firestore, docs };
  }

  it("keeps one global look per person, and reads a broken one as none", async () => {
    const f = fake({ "avatars/broken": { look: { ...LOOK, skin: 99 } } });
    const store = new FirestoreAvatarStore(() => f.db);

    expect(await store.save("u1", LOOK, AT)).toEqual(ok(undefined));
    expect(f.docs.get("avatars/u1")).toEqual({ look: LOOK, updatedAt: AT });
    expect(await store.get("u1")).toEqual(ok(LOOK));
    expect(await store.get("broken")).toEqual(ok(null));
    expect(await store.get("nobody")).toEqual(ok(null));
    expect(await store.remove("u1")).toEqual(ok(undefined));
    expect(f.docs.has("avatars/u1")).toBe(false);
  });
});
