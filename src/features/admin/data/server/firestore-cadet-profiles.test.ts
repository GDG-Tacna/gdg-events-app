import type { Firestore } from "firebase-admin/firestore";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { testEventResolver, withEventScope } from "@/test-utils/firestore-paths";

vi.mock("server-only", () => ({}));
vi.mock("@/shared/lib/firebase/admin", () => ({
  getAdminFirestore: () => {
    throw new Error("must be injected");
  },
}));

const { FirestoreCadetProfiles } = await import("./firestore-cadet-profiles");

function fakeFirestore(existing: string[], fail = false) {
  const db = {
    collection: withEventScope((name: string) => ({
      doc: (id: string) => ({
        get: async () => {
          if (fail) throw new Error("down");
          return { exists: existing.includes(`${name}/${id}`) };
        },
      }),
    })),
  };
  return db as unknown as Firestore;
}

describe("FirestoreCadetProfiles", () => {
  beforeEach(() => vi.spyOn(console, "error").mockImplementation(() => undefined));

  it("says whether the account has a cadet profile in the active edition", async () => {
    const profiles = new FirestoreCadetProfiles(() => fakeFirestore(["events/e1/participants/u-ana"]), testEventResolver);

    expect(await profiles.hasProfile("u-ana")).toEqual({ ok: true, value: true });
    expect(await profiles.hasProfile("u-luis")).toEqual({ ok: true, value: false });
  });

  it("reports a failed read instead of guessing", async () => {
    const profiles = new FirestoreCadetProfiles(() => fakeFirestore([], true), testEventResolver);

    expect(await profiles.hasProfile("u-ana")).toMatchObject({ ok: false });
    expect(console.error).toHaveBeenCalled();
  });
});
