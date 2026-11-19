import type { Firestore } from "firebase-admin/firestore";
import { describe, expect, it, vi } from "vitest";
import { testEventResolver } from "@/test-utils/firestore-paths";

vi.mock("server-only", () => ({}));
vi.mock("@/shared/lib/firebase/admin", () => ({ getAdminFirestore: () => { throw new Error("must be injected"); } }));

const { FirestoreTicketHolderStore, holderDocId } = await import("./firestore-ticket-holder-store");
const { FirestoreParticipantTicketStore, readTicket } = await import("./firestore-participant-ticket-store");

type Doc = Record<string, unknown>;

/** A slice of Firestore: documents, equality queries with counts, transactions and batches. */
function fakeFirestore(initial: Record<string, Doc> = {}) {
  const store = new Map<string, Doc>(Object.entries(initial));
  const snapshot = (path: string) => ({ exists: store.has(path), id: path.split("/").pop()!, data: () => store.get(path) });

  function ref(path: string): Record<string, unknown> {
    return { path, get: async () => snapshot(path) };
  }

  function collection(name: string) {
    const direct = () => [...store.keys()].filter((key) => key.startsWith(`${name}/`) && key.slice(name.length + 1).indexOf("/") === -1);
    const query = (filters: Array<(data: Doc | undefined) => boolean>) => ({
      where: (field: string, op: string, value: unknown) => {
        if (op !== "==") throw new Error(`unexpected ${op}`);
        return query([...filters, (data) => data?.[field] === value]);
      },
      count: () => ({ get: async () => ({ data: () => ({ count: direct().filter((path) => filters.every((filter) => filter(store.get(path)))).length }) }) }),
    });
    return { ...query([]), doc: (id: string) => ref(`${name}/${id}`) };
  }

  const db = {
    collection: (name: string) =>
      name === "events" ? { doc: (eventId: string) => ({ collection: (child: string) => collection(`events/${eventId}/${child}`) }) } : collection(name),
    runTransaction: async <T,>(fn: (tx: unknown) => Promise<T>): Promise<T> => {
      const pending: Array<() => void> = [];
      const tx = {
        get: async (target: { path: string }) => snapshot(target.path),
        update: (target: { path: string }, data: Doc) => pending.push(() => void store.set(target.path, { ...store.get(target.path), ...data })),
      };
      const result = await fn(tx);
      pending.forEach((commit) => commit());
      return result;
    },
    batch: () => {
      const pending: Array<() => void> = [];
      return {
        set: (target: { path: string }, data: Doc) => pending.push(() => void store.set(target.path, data)),
        commit: async () => pending.forEach((write) => write()),
      };
    },
  };
  return { db: db as unknown as Firestore, store };
}

const AT = new Date("2026-11-19T10:00:00Z");

describe("FirestoreTicketHolderStore", () => {
  it("stores the list under the edition, one line per email, and reads a line back", async () => {
    const { db, store } = fakeFirestore();
    const holders = new FirestoreTicketHolderStore(() => db, testEventResolver);

    expect((await holders.upsertMany([{ email: "ana@example.com", fullName: "Ana Torres", type: "premium" }, { email: "luis@example.com", fullName: "Luis", type: "general" }])).ok).toBe(true);

    expect([...store.keys()].some((path) => path.includes("/ticketHolders/") && path.includes(encodeURIComponent("ana@example.com")))).toBe(true);
    expect(await holders.get("ana@example.com")).toEqual({ ok: true, value: { email: "ana@example.com", fullName: "Ana Torres", type: "premium" } });
    expect(await holders.get("nobody@example.com")).toEqual({ ok: true, value: null });
  });

  it("replaces a line when the same email is stored again", async () => {
    const { db } = fakeFirestore();
    const holders = new FirestoreTicketHolderStore(() => db, testEventResolver);

    await holders.upsertMany([{ email: "ana@example.com", fullName: "Ana", type: "general" }]);
    await holders.upsertMany([{ email: "ana@example.com", fullName: "Ana", type: "pro" }]);

    expect(await holders.get("ana@example.com")).toMatchObject({ ok: true, value: { type: "pro" } });
  });

  it("counts the lines of each ticket", async () => {
    const { db } = fakeFirestore();
    const holders = new FirestoreTicketHolderStore(() => db, testEventResolver);
    await holders.upsertMany([
      { email: "a@example.com", fullName: "", type: "premium" },
      { email: "b@example.com", fullName: "", type: "premium" },
      { email: "c@example.com", fullName: "", type: "pro" },
      { email: "d@example.com", fullName: "", type: "general" },
    ]);

    expect(await holders.countByType()).toEqual({ ok: true, value: { general: 1, pro: 1, premium: 2 } });
  });

  it("encodes an email that has a slash so it stays one document", () => {
    expect(holderDocId("a/b@example.com")).not.toContain("/");
  });
});

describe("readTicket", () => {
  it("reads a profile without ticket fields as general by default", () => {
    expect(readTicket({ alias: "Nova" })).toEqual({ type: "general", source: "default", setBy: null, setAt: null });
    expect(readTicket(undefined)).toEqual({ type: "general", source: "default", setBy: null, setAt: null });
  });

  it("reads the stored ticket and when it was set", () => {
    expect(readTicket({ ticketType: "premium", ticketSource: "manual", ticketSetBy: "staff-1", ticketSetAt: { toDate: () => AT } })).toEqual({ type: "premium", source: "manual", setBy: "staff-1", setAt: AT });
  });
});

describe("FirestoreParticipantTicketStore", () => {
  const participantPath = (uid: string) => `events/e1/participants/${uid}`;

  it("writes only the ticket fields and answers the ticket the cadet had", async () => {
    const { db, store } = fakeFirestore({ [participantPath("u1")]: { alias: "Nova", xp: 120 } });
    const tickets = new FirestoreParticipantTicketStore(() => db, testEventResolver);

    expect(await tickets.set("u1", { type: "premium", source: "manual", by: "staff-1", at: AT })).toEqual({ ok: true, value: { before: "general" } });

    expect(store.get(participantPath("u1"))).toEqual({ alias: "Nova", xp: 120, ticketType: "premium", ticketSource: "manual", ticketSetBy: "staff-1", ticketSetAt: AT });
    expect(await tickets.get("u1")).toEqual({ ok: true, value: { type: "premium", source: "manual", setBy: "staff-1", setAt: AT } });
  });

  it("answers the previous ticket when there was one", async () => {
    const { db } = fakeFirestore({ [participantPath("u1")]: { alias: "Nova", ticketType: "pro", ticketSource: "list" } });
    const tickets = new FirestoreParticipantTicketStore(() => db, testEventResolver);

    expect(await tickets.set("u1", { type: "general", source: "manual", by: "admin-1", at: AT })).toEqual({ ok: true, value: { before: "pro" } });
  });

  it("answers null when the cadet is not registered, and writes nothing", async () => {
    const { db, store } = fakeFirestore();
    const tickets = new FirestoreParticipantTicketStore(() => db, testEventResolver);

    expect(await tickets.set("ghost", { type: "pro", source: "manual", by: null, at: AT })).toEqual({ ok: true, value: null });
    expect(await tickets.get("ghost")).toEqual({ ok: true, value: null });
    expect(store.size).toBe(0);
  });
});
