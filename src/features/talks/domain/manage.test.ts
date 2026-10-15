import { describe, expect, it, vi } from "vitest";
import { err, ok, type Result } from "@/shared/lib/result";
import { createTalk, listManagedTalks, setTalkActive, updateTalk, type TalkAdminDeps, type TalkPatch } from "./manage";
import type { Talk, TalkDraft } from "./talk";

const NOW = new Date("2026-10-20T15:00:00Z");
const ADMIN = { uid: "a1", role: "admin" as const };
const DRAFT: TalkDraft = { title: "Keynote", speaker: "Ana Torres", startsAt: "2026-10-24T09:00", endsAt: "2026-10-24T09:45", roomId: "auditorio", description: "" };
const STORED: Talk = {
  id: "keynote",
  title: "Keynote",
  speaker: "Ana Torres",
  startsAt: new Date("2026-10-24T14:00:00Z"),
  endsAt: new Date("2026-10-24T14:45:00Z"),
  roomId: "auditorio",
  description: "",
  active: true,
};

function setup({ rooms = ok(new Set(["auditorio", "sala-b"])) as Result<ReadonlySet<string>, { code: string }>, talks = [STORED] as Talk[] } = {}) {
  const store = new Map(talks.map((talk) => [talk.id, talk]));
  const deps = {
    store: {
      list: vi.fn(async () => ok([...store.values()])),
      create: vi.fn(async (talk: Talk) => {
        if (store.has(talk.id)) return err({ code: "already-exists" as const });
        store.set(talk.id, talk);
        return ok(undefined);
      }),
      update: vi.fn(async (id: string, patch: TalkPatch) => {
        const before = store.get(id);
        if (!before) return ok(null);
        const after = { ...before, ...patch };
        store.set(id, after);
        return ok({ before, after });
      }),
    },
    directory: { roomIds: vi.fn(async () => rooms) },
    audit: { append: vi.fn(async () => ok(undefined)) },
    now: () => NOW,
    utcOffset: "-05:00",
  } satisfies TalkAdminDeps;
  return { deps, store };
}

describe("talk administration", () => {
  it("is for admins only", async () => {
    const t = setup();
    for (const actor of [{ uid: "s1", role: "staff" as const }, { uid: "u1", role: "attendee" as const }, { uid: "x", role: null }]) {
      expect(await listManagedTalks(t.deps, actor)).toEqual(err({ code: "forbidden" }));
      expect(await createTalk(t.deps, actor, { id: "nueva", draft: DRAFT })).toEqual(err({ code: "forbidden" }));
      expect(await updateTalk(t.deps, actor, { id: "keynote", draft: DRAFT })).toEqual(err({ code: "forbidden" }));
      expect(await setTalkActive(t.deps, actor, { id: "keynote", active: false })).toEqual(err({ code: "forbidden" }));
    }
    expect(t.deps.store.create).not.toHaveBeenCalled();
    expect(t.deps.store.update).not.toHaveBeenCalled();
  });

  it("lists the talks in agenda order", async () => {
    const early = { ...STORED, id: "apertura", title: "Apertura", startsAt: new Date("2026-10-24T13:00:00Z") };
    const t = setup({ talks: [STORED, { ...STORED, id: "vieja", title: "Vieja", startsAt: null }, early] });

    const listed = await listManagedTalks(t.deps, ADMIN);
    expect(listed.ok && listed.value.map((talk) => talk.id)).toEqual(["apertura", "keynote", "vieja"]);
  });

  it("creates an open talk with the venue's times and audits it", async () => {
    const t = setup({ talks: [] });

    const created = await createTalk(t.deps, ADMIN, { id: "keynote", draft: DRAFT });

    expect(created).toEqual(ok(STORED));
    expect(t.store.get("keynote")).toEqual(STORED);
    expect(t.deps.audit.append).toHaveBeenCalledWith({ action: "talk.created", actorUid: "a1", targetUid: "keynote", details: { title: "Keynote" }, at: NOW });
  });

  it("refuses a bad draft, a room that is not in the plan and a taken id, without writing", async () => {
    const t = setup();

    expect(await createTalk(t.deps, ADMIN, { id: "nueva", draft: { ...DRAFT, speaker: "" } })).toEqual(err({ code: "invalid-speaker" }));
    expect(await createTalk(t.deps, ADMIN, { id: "nueva", draft: { ...DRAFT, roomId: "sotano" } })).toEqual(err({ code: "unknown-room" }));
    expect(await createTalk(t.deps, ADMIN, { id: "keynote", draft: DRAFT })).toEqual(err({ code: "already-exists" }));
    expect(t.deps.audit.append).not.toHaveBeenCalled();
  });

  it("does not ask for the rooms when the talk has none, and answers unknown when they cannot be read", async () => {
    const t = setup({ rooms: err({ code: "unknown" }), talks: [] });

    expect(await createTalk(t.deps, ADMIN, { id: "sin-sala", draft: { ...DRAFT, roomId: null } })).toMatchObject({ ok: true });
    expect(await createTalk(t.deps, ADMIN, { id: "con-sala", draft: DRAFT })).toEqual(err({ code: "unknown" }));
  });

  it("updates everything but the id, auditing only the fields that changed", async () => {
    const t = setup();

    const updated = await updateTalk(t.deps, ADMIN, { id: "keynote", draft: { ...DRAFT, endsAt: "2026-10-24T10:00", roomId: "sala-b" } });

    expect(updated).toMatchObject({ ok: true, value: { id: "keynote", endsAt: new Date("2026-10-24T15:00:00Z"), roomId: "sala-b", active: true } });
    expect(t.deps.audit.append).toHaveBeenCalledWith(expect.objectContaining({ action: "talk.updated", targetUid: "keynote", details: { changed: "endsAt,roomId" } }));
  });

  it("does not audit a save that changed nothing (dates compared by time)", async () => {
    const t = setup();

    expect(await updateTalk(t.deps, ADMIN, { id: "keynote", draft: DRAFT })).toMatchObject({ ok: true });
    expect(t.deps.audit.append).not.toHaveBeenCalled();
  });

  it("says not found for an unknown or malformed talk id", async () => {
    const t = setup();

    expect(await updateTalk(t.deps, ADMIN, { id: "nope", draft: DRAFT })).toEqual(err({ code: "not-found" }));
    expect(await updateTalk(t.deps, ADMIN, { id: "../x", draft: DRAFT })).toEqual(err({ code: "not-found" }));
    expect(await setTalkActive(t.deps, ADMIN, { id: "nope", active: false })).toEqual(err({ code: "not-found" }));
  });

  it("opens and closes a talk, auditing only a real change", async () => {
    const t = setup();

    expect(await setTalkActive(t.deps, ADMIN, { id: "keynote", active: false })).toMatchObject({ ok: true, value: { active: false } });
    expect(t.deps.audit.append).toHaveBeenCalledWith(expect.objectContaining({ action: "talk.deactivated", details: { title: "Keynote" } }));

    await setTalkActive(t.deps, ADMIN, { id: "keynote", active: false });
    expect(t.deps.audit.append).toHaveBeenCalledTimes(1);

    await setTalkActive(t.deps, ADMIN, { id: "keynote", active: true });
    expect(t.deps.audit.append).toHaveBeenLastCalledWith(expect.objectContaining({ action: "talk.activated" }));
  });

  it("reports store failures as unknown", async () => {
    const t = setup();
    t.deps.store.list.mockResolvedValue(err({ code: "x" }) as never);
    t.deps.store.update.mockResolvedValue(err({ code: "x" }) as never);
    t.deps.store.create.mockResolvedValue(err({ code: "unknown" }) as never);

    expect(await listManagedTalks(t.deps, ADMIN)).toEqual(err({ code: "unknown" }));
    expect(await updateTalk(t.deps, ADMIN, { id: "keynote", draft: DRAFT })).toEqual(err({ code: "unknown" }));
    expect(await setTalkActive(t.deps, ADMIN, { id: "keynote", active: false })).toEqual(err({ code: "unknown" }));
    expect(await createTalk(t.deps, ADMIN, { id: "otra", draft: DRAFT })).toEqual(err({ code: "unknown" }));
  });
});
