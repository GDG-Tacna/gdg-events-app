import type { Firestore } from "firebase-admin/firestore";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { testEventResolver, withEventScope } from "@/test-utils/firestore-paths";

vi.mock("server-only", () => ({}));
vi.mock("@/shared/lib/firebase/admin", () => ({ getAdminFirestore: () => { throw new Error("must be injected"); } }));

const { FirestoreTeamRepository } = await import("./firestore-team-repository");

type Doc = Record<string, unknown>;

/**
 * In-memory stand-in for the slice of Firestore the repository uses: the global `team` collection and the edition's
 * `events/e1/team`, a `where("role", "==", x)` query read inside a transaction, set and delete. Real transaction
 * contention needs the emulator.
 */
function fakeFirestore(initial: Record<string, Doc>) {
  const store = new Map<string, Doc>(Object.entries(initial));
  const writes: string[] = [];
  const docSnapshot = (path: string) => ({ exists: store.has(path), id: path.split("/").pop()!, data: () => store.get(path) });
  const inCollection = (name: string) => (key: string) => key.startsWith(`${name}/`) && key.split("/").length === name.split("/").length + 1;

  const collection = (name: string) => ({
    doc: (id: string) => ({ path: `${name}/${id}`, get: async () => docSnapshot(`${name}/${id}`) }),
    where: (field: string, _op: string, value: unknown) => ({ name, field, value }),
    get: async () => ({ docs: [...store.keys()].filter(inCollection(name)).map(docSnapshot) }),
  });

  const db = {
    collection: withEventScope(collection),
    runTransaction: async <T,>(fn: (tx: unknown) => Promise<T>): Promise<T> => {
      const pending: Array<() => void> = [];
      const tx = {
        get: async (target: { path?: string; name?: string; field?: string; value?: unknown }) => {
          if (target.path) return docSnapshot(target.path);
          const docs = [...store.entries()]
            .filter(([key, data]) => inCollection(target.name as string)(key) && data[target.field as string] === target.value)
            .map(([key]) => docSnapshot(key));
          return { size: docs.length, docs };
        },
        set: (ref: { path: string }, data: Doc) => pending.push(() => (store.set(ref.path, data), writes.push(`set ${ref.path}`))),
        delete: (ref: { path: string }) => pending.push(() => (store.delete(ref.path), writes.push(`delete ${ref.path}`))),
      };
      const result = await fn(tx);
      pending.forEach((commit) => commit());
      return result;
    },
  };
  return { db: db as unknown as Firestore, store, writes };
}

const ana = { uid: "u-ana", email: "ana@example.com", displayName: "Ana" };
const bruno = { uid: "u-bruno", email: "bruno@example.com", displayName: null };

describe("FirestoreTeamRepository", () => {
  let fake: ReturnType<typeof fakeFirestore>;
  let repository: InstanceType<typeof FirestoreTeamRepository>;

  const setup = (docs: Record<string, Doc>) => {
    fake = fakeFirestore(docs);
    repository = new FirestoreTeamRepository(() => fake.db, testEventResolver);
  };

  beforeEach(() => {
    setup({
      "team/u-ana": { email: "ana@example.com", displayName: "Ana", role: "admin" },
      "team/u-old": { email: "old@example.com", displayName: null, role: "staff" },
      "team/u-bad": { email: "bad@example.com", role: "root" },
      "events/e1/team/u-zed": { email: "zed@example.com", displayName: null, role: "staff" },
      "events/e1/team/u-org": { email: "org@example.com", displayName: "Org", role: "organizer" },
      "events/e0/team/u-past": { email: "past@example.com", displayName: null, role: "staff" },
    });
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("lists global admins and this edition's staff and organizers, sorted by email, skipping malformed and past ones", async () => {
    const result = await repository.list();

    expect(result.ok && result.value.map((member) => [member.email, member.role])).toEqual([
      ["ana@example.com", "admin"],
      ["old@example.com", "staff"],
      ["org@example.com", "organizer"],
      ["zed@example.com", "staff"],
    ]);
  });

  it("answers a person's role, and only the edition's for the session check", async () => {
    expect(await repository.roleOf("u-ana")).toEqual({ ok: true, value: "admin" });
    expect(await repository.roleOf("u-org")).toEqual({ ok: true, value: "organizer" });
    expect(await repository.roleOf("u-past")).toEqual({ ok: true, value: null });

    expect(await repository.editionRoleOf("u-zed", "e1")).toEqual({ ok: true, value: "staff" });
    expect(await repository.editionRoleOf("u-zed", "other")).toEqual({ ok: true, value: null });
    expect(await repository.editionRoleOf("u-ana", "e1")).toEqual({ ok: true, value: null });
    // An older global staff record does not make a session valid: staff belong to an edition.
    expect(await repository.editionRoleOf("u-old", "e1")).toEqual({ ok: true, value: null });
  });

  it("files staff and organizers under the edition and admins in the global list", async () => {
    expect(await repository.change(bruno, "staff")).toEqual({ ok: true, value: { previous: null } });
    expect(fake.store.get("events/e1/team/u-bruno")).toMatchObject({ email: "bruno@example.com", role: "staff" });

    expect(await repository.change(bruno, "admin")).toEqual({ ok: true, value: { previous: "staff" } });
    expect(fake.store.has("events/e1/team/u-bruno")).toBe(false);
    expect(fake.store.get("team/u-bruno")).toMatchObject({ role: "admin" });

    expect(await repository.change(bruno, "organizer")).toEqual({ ok: true, value: { previous: "admin" } });
    expect(fake.store.has("team/u-bruno")).toBe(false);
    expect(fake.store.get("events/e1/team/u-bruno")).toMatchObject({ role: "organizer" });
  });

  it("removes a member from both lists, and clears an older global staff record", async () => {
    expect(await repository.change({ uid: "u-org", email: "org@example.com", displayName: "Org" }, null)).toEqual({ ok: true, value: { previous: "organizer" } });
    expect(fake.store.has("events/e1/team/u-org")).toBe(false);

    expect(await repository.change({ uid: "u-old", email: "old@example.com", displayName: null }, "staff")).toEqual({ ok: true, value: { previous: "staff" } });
    expect(fake.store.has("team/u-old")).toBe(false);
    expect(fake.store.get("events/e1/team/u-old")).toMatchObject({ role: "staff" });
  });

  it("refuses to remove or demote the last admin, writing nothing", async () => {
    expect(await repository.change(ana, null)).toEqual({ ok: false, error: { code: "last-admin" } });
    expect(await repository.change(ana, "organizer")).toEqual({ ok: false, error: { code: "last-admin" } });
    expect(fake.writes).toEqual([]);

    await repository.change(bruno, "admin");
    expect(await repository.change(ana, "staff")).toEqual({ ok: true, value: { previous: "admin" } });
  });

  it("removing someone who is not on the team writes nothing", async () => {
    expect(await repository.change(bruno, null)).toEqual({ ok: true, value: { previous: null } });
    expect(fake.writes).toEqual([]);
  });

  it("turns unexpected failures into an unknown error", async () => {
    const broken = new FirestoreTeamRepository(() => ({ collection: () => { throw new Error("offline"); } }) as unknown as Firestore, testEventResolver);

    expect(await broken.list()).toEqual({ ok: false, error: { code: "unknown" } });
    expect(await broken.roleOf("x")).toEqual({ ok: false, error: { code: "unknown" } });
    expect(await broken.editionRoleOf("x", "e1")).toEqual({ ok: false, error: { code: "unknown" } });
    expect(await broken.editionRolesOf("x")).toEqual({ ok: false, error: { code: "unknown" } });
    expect(await broken.change(ana, "staff")).toEqual({ ok: false, error: { code: "unknown" } });
  });

  it("lists every edition where a person is staff or organizer, skipping anything that is not an edition", async () => {
    const records: Record<string, Doc> = { "events/e1/team/u-zed": { role: "staff" }, "events/meetup-nov/team/u-zed": { role: "organizer" }, "events/old/team/u-zed": { role: "admin" } };
    const db = {
      collection: (name: string) => ({
        listDocuments: async () => (name === "events" ? [{ id: "e1" }, { id: "meetup-nov" }, { id: "old" }, { id: "Not An Edition" }] : []),
        doc: (eventId: string) => ({ collection: (child: string) => ({ doc: (uid: string) => ({ path: `${name}/${eventId}/${child}/${uid}` }) }) }),
      }),
      getAll: async (...refs: Array<{ path: string }>) => refs.map((ref) => ({ data: () => records[ref.path] })),
    } as unknown as Firestore;

    expect(await new FirestoreTeamRepository(() => db, testEventResolver).editionRolesOf("u-zed")).toEqual({
      ok: true,
      value: [
        { eventId: "e1", role: "staff" },
        { eventId: "meetup-nov", role: "organizer" },
      ],
    });
  });
});
