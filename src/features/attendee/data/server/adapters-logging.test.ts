import type { Auth } from "firebase-admin/auth";
import type { Firestore } from "firebase-admin/firestore";
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import { testEventResolver } from "@/test-utils/firestore-paths";

vi.mock("server-only", () => ({}));
vi.mock("@/shared/lib/firebase/admin", () => ({
  getAdminFirestore: () => {
    throw new Error("must be injected");
  },
  getAdminAuth: () => {
    throw new Error("must be injected");
  },
}));

const { FirestoreAttendeeRepository } = await import("./firestore-attendee-repository");
const { FirebaseRoleGranter } = await import("./firebase-role-granter");
const { FirestoreSquadRepository } = await import("@/features/squads/data/server/firestore-squad-repository");

const credentialsError = Object.assign(new Error("Could not load the default credentials"), {
  code: "app/invalid-credential",
});
const brokenDb = () => {
  throw credentialsError;
};
const NOW = new Date("2026-10-04T12:00:00Z");
const attendee = { uid: "u1", alias: "Nova_7", role: "attendee" as const, squad: null, xp: 0, credits: 0, createdAt: NOW };
const alias = { display: "Nova_7", key: "nova_7" };

describe("server adapters report unexpected failures instead of swallowing them", () => {
  let spy: MockInstance<typeof console.error>;

  beforeEach(() => {
    spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
  });
  afterEach(() => {
    spy.mockRestore();
  });

  const scopes = () => spy.mock.calls.map((call) => (JSON.parse(call[0] as string) as { scope: string }).scope);

  it("attendee repository: findByUid", async () => {
    const repository = new FirestoreAttendeeRepository(brokenDb as unknown as () => Firestore, testEventResolver);

    expect(await repository.findByUid("u1")).toEqual({ ok: false, error: { code: "unknown" } });
    expect(scopes()).toEqual(["attendee.findByUid"]);
  });

  it("attendee repository: register", async () => {
    const repository = new FirestoreAttendeeRepository(brokenDb as unknown as () => Firestore, testEventResolver);

    expect(await repository.register(attendee, alias)).toEqual({ ok: false, error: { code: "unknown" } });
    expect(scopes()).toEqual(["attendee.register"]);
  });

  it("role granter", async () => {
    const granter = new FirebaseRoleGranter(brokenDb as unknown as () => Auth);

    expect(await granter.grantAttendeeRole("u1")).toEqual({ ok: false, error: { code: "unknown" } });
    expect(scopes()).toEqual(["attendee.grantRole"]);
  });

  it("squad repository", async () => {
    const repository = new FirestoreSquadRepository(brokenDb as unknown as () => Firestore, testEventResolver);

    expect(await repository.assignIfUnassigned("u1", "cloud")).toEqual({ ok: false, error: { code: "unknown" } });
    expect(scopes()).toEqual(["squads.assign"]);
  });

  it("does not log expected business outcomes", async () => {
    const granter = new FirebaseRoleGranter(
      () => ({ getUser: async () => ({ customClaims: { role: "attendee" } }), setCustomUserClaims: vi.fn() }) as unknown as Auth,
    );

    await granter.grantAttendeeRole("u1");

    expect(spy).not.toHaveBeenCalled();
  });
});
