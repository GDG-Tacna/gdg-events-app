import type { Firestore } from "firebase-admin/firestore";
import { describe, expect, it, vi } from "vitest";
import { err, ok } from "@/shared/lib/result";
import { testEventResolver, withEventScope } from "@/test-utils/firestore-paths";

vi.mock("server-only", () => ({}));
vi.mock("@/shared/lib/firebase/admin", () => ({ getAdminFirestore: () => { throw new Error("must be injected"); } }));

const { FirestoreAwardStore } = await import("./firestore-award-store");

type Doc = Record<string, unknown>;
const AT = new Date("2026-10-24T15:00:00Z");

function fakeFirestore(initial: Record<string, Doc>) {
  const store = new Map<string, Doc>(Object.entries(initial));
  const db = {
    collection: withEventScope((name: string) => ({
      where: (field: string, op: string, value: unknown) => ({
        get: async () => ({
          ...(op === "==" ? {} : (() => { throw new Error(`unexpected operator ${op}`); })()),
          docs: [...store.entries()].filter(([key, doc]) => key.startsWith(`${name}/`) && doc[field] === value).map(([key, doc]) => ({ id: key.split("/").pop(), data: () => doc })),
        }),
      }),
      doc: (id: string) => ({
        create: async (data: Doc) => {
          if (store.has(`${name}/${id}`)) throw Object.assign(new Error("exists"), { code: 6 });
          store.set(`${name}/${id}`, data);
        },
      }),
    })),
  };
  return { db: db as unknown as Firestore, store };
}

describe("FirestoreAwardStore", () => {
  it("awards once per attendee and badge: the second time answers not awarded", async () => {
    const fake = fakeFirestore({});
    const awards = new FirestoreAwardStore(() => fake.db, testEventResolver);

    expect(await awards.award({ uid: "u1", badgeId: "primer-salto", at: AT })).toEqual(ok({ awarded: true }));
    expect(await awards.award({ uid: "u1", badgeId: "primer-salto", at: new Date() })).toEqual(ok({ awarded: false }));
    expect(fake.store.get("events/e1/achievementAwards/u1_primer-salto")).toEqual({ uid: "u1", badgeId: "primer-salto", at: AT });
  });

  it("reads one attendee's awards with their dates, from a Date or a Firestore timestamp, skipping broken ones", async () => {
    const fake = fakeFirestore({
      "events/e1/achievementAwards/u1_a": { uid: "u1", badgeId: "a", at: AT },
      "events/e1/achievementAwards/u1_b": { uid: "u1", badgeId: "b", at: { toDate: () => AT } },
      "events/e1/achievementAwards/u1_c": { uid: "u1", badgeId: "c" },
      "events/e1/achievementAwards/u1_d": { uid: "u1", at: AT },
      "events/e1/achievementAwards/u2_a": { uid: "u2", badgeId: "a", at: AT },
    });
    const awards = new FirestoreAwardStore(() => fake.db, testEventResolver);

    expect(await awards.awardsOf("u1")).toEqual(ok(new Map([["a", AT], ["b", AT]])));
    expect(await awards.awardsOf("u3")).toEqual(ok(new Map()));
  });

  it("reports failures as unknown", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const broken = new FirestoreAwardStore(() => {
      throw new Error("offline");
    }, testEventResolver);

    expect(await broken.awardsOf("u1")).toEqual(err({ code: "unknown" }));
    expect(await broken.award({ uid: "u1", badgeId: "a", at: AT })).toEqual(err({ code: "unknown" }));
  });
});
