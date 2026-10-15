import type { Firestore } from "firebase-admin/firestore";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { testEventResolver, withEventScope } from "@/test-utils/firestore-paths";
import type { Invite } from "../../domain/invites";

vi.mock("server-only", () => ({}));
vi.mock("@/shared/lib/firebase/admin", () => ({ getAdminFirestore: () => { throw new Error("must be injected"); } }));

const { FirestoreInviteStore } = await import("./firestore-invite-store");

const NOW = new Date("2026-10-20T12:00:00Z");
const INVITE: Invite = {
  id: "h1",
  email: "ana@example.com",
  role: "staff",
  invitedBy: "admin-1",
  createdAt: NOW,
  expiresAt: new Date("2026-10-27T12:00:00Z"),
  acceptedAt: null,
  acceptedBy: null,
  revokedAt: null,
};

function fakeFirestore() {
  const store = new Map<string, Record<string, unknown>>();
  const snapshot = (path: string) => ({ exists: store.has(path), id: path.split("/").pop()!, data: () => store.get(path) });
  const collection = (name: string) => ({
    doc: (id: string) => {
      const path = `${name}/${id}`;
      return {
        path,
        get: async () => snapshot(path),
        create: async (data: Record<string, unknown>) => {
          if (store.has(path)) throw Object.assign(new Error("exists"), { code: 6 });
          store.set(path, data);
        },
        update: async (data: Record<string, unknown>) => store.set(path, { ...store.get(path), ...data }),
      };
    },
    get: async () => ({ docs: [...store.keys()].filter((key) => key.startsWith(`${name}/`)).map(snapshot) }),
  });
  const db = {
    collection: withEventScope(collection),
    runTransaction: async <T,>(fn: (tx: unknown) => Promise<T>) =>
      fn({ get: async (ref: { path: string }) => snapshot(ref.path), update: (ref: { path: string }, data: Record<string, unknown>) => store.set(ref.path, { ...store.get(ref.path), ...data }) }),
  } as unknown as Firestore;
  return { db, store };
}

describe("FirestoreInviteStore", () => {
  let fake: ReturnType<typeof fakeFirestore>;
  let invites: InstanceType<typeof FirestoreInviteStore>;
  beforeEach(() => {
    fake = fakeFirestore();
    invites = new FirestoreInviteStore(() => fake.db, testEventResolver);
  });

  it("keeps invitations of the edition under their hash and lists them newest first", async () => {
    await invites.create(INVITE);
    await invites.create({ ...INVITE, id: "h2", createdAt: new Date("2026-10-21T12:00:00Z") });

    expect(fake.store.get("events/e1/invites/h1")).toMatchObject({ email: "ana@example.com", role: "staff" });
    expect(fake.store.get("events/e1/invites/h1")).not.toHaveProperty("id");
    const listed = await invites.list();
    expect(listed.ok && listed.value.map((invite) => invite.id)).toEqual(["h2", "h1"]);
    expect(await invites.get("h1")).toEqual({ ok: true, value: INVITE });
  });

  it("accepts a pending invitation once, and can put it back", async () => {
    await invites.create(INVITE);

    expect(await invites.accept("h1", "u-ana", NOW)).toEqual({ ok: true, value: true });
    expect(await invites.accept("h1", "u-bob", NOW)).toEqual({ ok: true, value: false });
    expect(fake.store.get("events/e1/invites/h1")).toMatchObject({ acceptedBy: "u-ana" });

    await invites.undoAccept("h1");
    expect(await invites.accept("h1", "u-ana", NOW)).toEqual({ ok: true, value: true });
  });

  it("never accepts an expired or revoked invitation", async () => {
    await invites.create(INVITE);
    expect(await invites.accept("h1", "u-ana", new Date("2026-10-27T12:00:00Z"))).toEqual({ ok: true, value: false });

    await invites.revoke("h1", NOW);
    expect(await invites.accept("h1", "u-ana", NOW)).toEqual({ ok: true, value: false });
    expect(await invites.revoke("zz", NOW)).toEqual({ ok: true, value: null });
  });

  it("reports failures without details", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const broken = new FirestoreInviteStore(() => ({ collection: () => { throw new Error("offline"); } }) as unknown as Firestore, testEventResolver);

    expect(await broken.list()).toEqual({ ok: false, error: { code: "unknown" } });
    expect(await broken.get("h1")).toEqual({ ok: false, error: { code: "unknown" } });
    expect(await broken.accept("h1", "u", NOW)).toEqual({ ok: false, error: { code: "unknown" } });
  });
});
