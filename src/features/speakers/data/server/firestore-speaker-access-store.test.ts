import type { Firestore } from "firebase-admin/firestore";
import { describe, expect, it, vi } from "vitest";
import { testEventResolver, withEventScope } from "@/test-utils/firestore-paths";

vi.mock("server-only", () => ({}));
vi.mock("@/shared/lib/firebase/admin", () => ({ getAdminFirestore: () => { throw new Error("must be injected"); } }));
vi.mock("@/shared/lib/log", () => ({ logServerError: vi.fn() }));
vi.mock("@/features/media/server", () => ({ imageRefOf: (path: string) => ({ path, url: `/media/${path}` }) }));

const { FirestoreSpeakerAccessStore, toInvite } = await import("./firestore-speaker-access-store");

type Doc = Record<string, unknown>;
function fakeFirestore(initial: Record<string, Doc> = {}) {
  const store = new Map<string, Doc>(Object.entries(initial));
  const snap = (path: string) => ({ exists: store.has(path), id: path.split("/").pop()!, data: () => store.get(path) });
  const db = {
    collection: withEventScope((name: string) => ({
      get: async () => ({ docs: [...store.keys()].filter((key) => key.startsWith(`${name}/`)).map(snap) }),
      doc: (id: string) => ({ path: `${name}/${id}` }),
    })),
    runTransaction: async <T,>(fn: (tx: unknown) => Promise<T>) => {
      const pending: Array<() => void> = [];
      const result = await fn({
        get: async (ref: { path: string }) => snap(ref.path),
        update: (ref: { path: string }, data: Doc) =>
          pending.push(() => {
            const next: Doc = { ...store.get(ref.path) };
            for (const [key, value] of Object.entries(data)) {
              const [head, tail] = key.split(".");
              if (tail) next[head] = { ...(next[head] as Doc), [tail]: value };
              else next[key] = value;
            }
            store.set(ref.path, next);
          }),
      });
      pending.forEach((commit) => commit());
      return result;
    },
  };
  return { db: db as unknown as Firestore, store };
}

const NOW = new Date("2026-10-20T15:00:00Z");
const LATER = new Date("2026-10-30T15:00:00Z");
const INVITE = { hash: "h1", email: "ana@gmail.com", invitedBy: "admin-1", expiresAt: LATER, acceptedAt: null };
const PATH = "events/e1/speakers/ana";

describe("FirestoreSpeakerAccessStore", () => {
  it("reads each speaker with their account and invitation, ignoring a broken invitation", async () => {
    const fake = fakeFirestore({
      [PATH]: { name: "Ana", accountUid: "a1", invite: { ...INVITE, expiresAt: { toDate: () => LATER } } },
      "events/e1/speakers/luis": { name: "Luis", active: false, invite: { hash: "h2" } },
    });
    const store = new FirestoreSpeakerAccessStore(() => fake.db, testEventResolver);

    expect(await store.rows()).toEqual({
      ok: true,
      value: [
        { speakerId: "ana", name: "Ana", active: true, accountUid: "a1", invite: INVITE },
        { speakerId: "luis", name: "Luis", active: false, accountUid: null, invite: null },
      ],
    });
    expect(toInvite(null)).toBeNull();
  });

  it("stores an invitation dropping the linked account, and answers false for an unknown speaker", async () => {
    const fake = fakeFirestore({ [PATH]: { name: "Ana", accountUid: "old" } });
    const store = new FirestoreSpeakerAccessStore(() => fake.db, testEventResolver);

    expect(await store.invite("ana", INVITE)).toEqual({ ok: true, value: true });
    expect(fake.store.get(PATH)).toMatchObject({ accountUid: null, invite: INVITE });
    expect(await store.invite("ghost", INVITE)).toEqual({ ok: true, value: false });
  });

  it("claims a pending invitation once, for one account", async () => {
    const fake = fakeFirestore({ [PATH]: { name: "Ana", invite: INVITE } });
    const store = new FirestoreSpeakerAccessStore(() => fake.db, testEventResolver);

    expect(await store.claim("ana", "wrong-hash", "a1", NOW)).toEqual({ ok: true, value: "gone" });
    expect(await store.claim("ana", "h1", "a1", NOW)).toEqual({ ok: true, value: "linked" });
    expect(fake.store.get(PATH)).toMatchObject({ accountUid: "a1", invite: { hash: "h1", acceptedAt: NOW } });
    expect(await store.claim("ana", "h1", "a1", NOW)).toEqual({ ok: true, value: "linked" });
    expect(await store.claim("ana", "h1", "someone-else", NOW)).toEqual({ ok: true, value: "gone" });
    expect(await store.claim("ana", "h1", "a2", new Date("2027-01-01"))).toEqual({ ok: true, value: "gone" });
  });

  it("refuses an expired invitation and unlinks", async () => {
    const fake = fakeFirestore({ [PATH]: { name: "Ana", invite: { ...INVITE, expiresAt: NOW } } });
    const store = new FirestoreSpeakerAccessStore(() => fake.db, testEventResolver);

    expect(await store.claim("ana", "h1", "a1", NOW)).toEqual({ ok: true, value: "gone" });
    expect(await store.unlink("ana")).toEqual({ ok: true, value: true });
    expect(fake.store.get(PATH)).toMatchObject({ accountUid: null, invite: null });
    expect(await store.unlink("ghost")).toEqual({ ok: true, value: false });
  });
});
