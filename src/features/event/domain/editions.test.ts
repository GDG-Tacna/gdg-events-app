import { describe, expect, it, vi } from "vitest";
import { err, ok, type Result } from "@/shared/lib/result";
import {
  checkEditionDraft,
  createEdition,
  listEditionChoices,
  listEditions,
  publishEdition,
  setEditionStatus,
  suggestEditionId,
  updateEdition,
  type Edition,
  type EditionDraft,
  type EditionPatch,
  type EditionsAuditEntry,
  type EditionsDeps,
} from "./editions";

vi.mock("@/shared/lib/log", () => ({ logServerError: vi.fn() }));

const GLOBAL = { uid: "a1", role: "admin", adminScope: "global" } as const;
const ORGANIZER = { uid: "o1", role: "admin", adminScope: "edition" } as const;
const STAFF = { uid: "s1", role: "staff" } as const;

const edition = (id: string, extra: Partial<Edition> = {}): Edition => ({ id, name: null, venue: null, startsAt: null, endsAt: null, status: "draft", ...extra });
const DRAFT: EditionDraft = { name: "  GDG  Meetup noviembre ", venue: "Auditorio UNJBG", startsAt: "2026-11-20T18:00", endsAt: "2026-11-20T21:00" };

function setup(initial: Edition[] = [edition("devfest-2026", { startsAt: new Date("2026-10-24T14:00:00Z") })], publicId = "devfest-2026") {
  const rows = new Map(initial.map((e) => [e.id, e]));
  let current = publicId;
  const entries: EditionsAuditEntry[] = [];
  const deps = {
    catalog: {
      list: vi.fn(async (): Promise<Result<readonly Edition[], { code: string }>> => ok([...rows.values()])),
      publicId: vi.fn(async (): Promise<Result<string, { code: string }>> => ok(current)),
      create: vi.fn(async (e: Edition): Promise<Result<void, { code: "already-exists" | "unknown" }>> => {
        if (rows.has(e.id)) return err({ code: "already-exists" });
        rows.set(e.id, e);
        return ok(undefined);
      }),
      update: vi.fn(async (id: string, patch: EditionPatch) => {
        const before = rows.get(id) ?? edition(id);
        const after = { ...before, ...patch };
        rows.set(id, after);
        return ok({ before, after });
      }),
      publish: vi.fn(async (id: string) => {
        const previous = current;
        current = id;
        return ok({ previous });
      }),
    },
    audit: { append: vi.fn(async (entry: EditionsAuditEntry) => (entries.push(entry), ok(undefined))) },
    now: () => new Date(0),
  } satisfies EditionsDeps;
  return { deps, rows, entries, publicId: () => current };
}

describe("edition rules", () => {
  it("suggests an id from a name", () => {
    expect(suggestEditionId("DevFest Tacna 2027")).toBe("devfest-tacna-2027");
    expect(suggestEditionId("  Ñandú & Café — Noviembre!! ")).toBe("nandu-cafe-noviembre");
  });

  it("tidies the draft and reads the dates in Lima time", () => {
    expect(checkEditionDraft(DRAFT)).toEqual(
      ok({ name: "GDG Meetup noviembre", venue: "Auditorio UNJBG", startsAt: new Date("2026-11-20T23:00:00Z"), endsAt: new Date("2026-11-21T02:00:00Z") }),
    );
    expect(checkEditionDraft({ name: "Meetup", venue: " ", startsAt: "", endsAt: "" })).toEqual(ok({ name: "Meetup", venue: null, startsAt: null, endsAt: null }));
  });

  it("refuses a short name, a long venue, a bad date and an end before the start", () => {
    expect(checkEditionDraft({ ...DRAFT, name: "ab" })).toEqual(err({ code: "invalid-name" }));
    expect(checkEditionDraft({ ...DRAFT, venue: "x".repeat(81) })).toEqual(err({ code: "invalid-venue" }));
    expect(checkEditionDraft({ ...DRAFT, startsAt: "mañana" })).toEqual(err({ code: "invalid-date" }));
    expect(checkEditionDraft({ ...DRAFT, endsAt: "2026-11-19T10:00" })).toEqual(err({ code: "invalid-range" }));
  });
});

describe("listEditions", () => {
  it("shows every edition to an admin of all of them, the public one first, then the newest", async () => {
    const { deps } = setup([edition("old", { startsAt: new Date("2025-10-01") }), edition("next", { startsAt: new Date("2026-11-20") }), edition("devfest-2026")]);

    const listed = await listEditions(deps, GLOBAL);

    expect(listed.ok && listed.value.map((e) => [e.id, e.isPublic])).toEqual([
      ["devfest-2026", true],
      ["next", false],
      ["old", false],
    ]);
  });

  it("adds the public edition when nothing was written under it yet", async () => {
    const { deps } = setup([], "devfest-2026");

    expect(await listEditions(deps, GLOBAL)).toEqual(ok([{ ...edition("devfest-2026"), isPublic: true }]));
  });

  it("shows an organizer only the public edition and refuses anyone else", async () => {
    const { deps } = setup([edition("devfest-2026"), edition("next")]);

    const listed = await listEditions(deps, ORGANIZER);
    expect(listed.ok && listed.value.map((e) => e.id)).toEqual(["devfest-2026"]);
    expect(await listEditions(deps, STAFF)).toEqual(err({ code: "forbidden" }));
  });
});

describe("createEdition", () => {
  it("creates a draft edition and audits it", async () => {
    const { deps, entries } = setup();

    const created = await createEdition(deps, GLOBAL, { id: "meetup-nov", draft: DRAFT });

    expect(created).toMatchObject(ok({ id: "meetup-nov", name: "GDG Meetup noviembre", status: "draft" }));
    expect(entries[0]).toMatchObject({ action: "event.created", targetUid: "meetup-nov", details: { name: "GDG Meetup noviembre" } });
  });

  it("refuses an organizer, a bad id, a taken id and the public id even without a document", async () => {
    const { deps } = setup([edition("next")], "devfest-2026");

    expect(await createEdition(deps, ORGANIZER, { id: "meetup-nov", draft: DRAFT })).toEqual(err({ code: "forbidden" }));
    expect(await createEdition(deps, GLOBAL, { id: "Meetup Nov", draft: DRAFT })).toEqual(err({ code: "invalid-id" }));
    expect(await createEdition(deps, GLOBAL, { id: "next", draft: DRAFT })).toEqual(err({ code: "already-exists" }));
    expect(await createEdition(deps, GLOBAL, { id: "devfest-2026", draft: DRAFT })).toEqual(err({ code: "already-exists" }));
    expect(deps.catalog.create).not.toHaveBeenCalled();
  });
});

describe("updateEdition", () => {
  it("saves the details and audits which ones changed", async () => {
    const { deps, entries } = setup();

    const updated = await updateEdition(deps, GLOBAL, { id: "devfest-2026", draft: { ...DRAFT, name: "DevFest Tacna 2026" } });

    expect(updated).toMatchObject(ok({ name: "DevFest Tacna 2026", venue: "Auditorio UNJBG" }));
    expect(entries[0]).toMatchObject({ action: "event.updated", details: { changed: "name,venue,startsAt,endsAt" } });
  });

  it("lets an organizer edit only the edition it works in (the public one unless it picked another)", async () => {
    const { deps } = setup([edition("devfest-2026"), edition("next")]);

    expect((await updateEdition(deps, ORGANIZER, { id: "devfest-2026", draft: DRAFT })).ok).toBe(true);
    expect(await updateEdition(deps, ORGANIZER, { id: "next", draft: DRAFT })).toEqual(err({ code: "forbidden" }));
    expect((await updateEdition(deps, { ...ORGANIZER, editionId: "next" }, { id: "next", draft: DRAFT })).ok).toBe(true);
    expect(await updateEdition(deps, { ...ORGANIZER, editionId: "next" }, { id: "devfest-2026", draft: DRAFT })).toEqual(err({ code: "forbidden" }));
  });

  it("refuses an unknown edition and a bad draft before writing", async () => {
    const { deps } = setup();

    expect(await updateEdition(deps, GLOBAL, { id: "ghost", draft: DRAFT })).toEqual(err({ code: "not-found" }));
    expect(await updateEdition(deps, GLOBAL, { id: "devfest-2026", draft: { ...DRAFT, name: "" } })).toEqual(err({ code: "invalid-name" }));
    expect(deps.catalog.update).not.toHaveBeenCalled();
  });
});

describe("setEditionStatus and publishEdition", () => {
  it("finishes and reopens an edition, auditing only real changes", async () => {
    const { deps, entries } = setup();

    await setEditionStatus(deps, GLOBAL, { id: "devfest-2026", status: "finished" });
    await setEditionStatus(deps, GLOBAL, { id: "devfest-2026", status: "finished" });
    await setEditionStatus(deps, GLOBAL, { id: "devfest-2026", status: "draft" });

    expect(entries.map((e) => e.action)).toEqual(["event.finished", "event.reopened"]);
    expect(await setEditionStatus(deps, ORGANIZER, { id: "devfest-2026", status: "finished" })).toEqual(err({ code: "forbidden" }));
  });

  it("makes another edition public and audits which one it replaced", async () => {
    const t = setup([edition("devfest-2026"), edition("meetup-nov")]);

    expect(await publishEdition(t.deps, GLOBAL, { id: "meetup-nov" })).toEqual(ok({ previous: "devfest-2026" }));
    expect(t.publicId()).toBe("meetup-nov");
    expect(t.entries[0]).toMatchObject({ action: "event.published", targetUid: "meetup-nov", details: { previous: "devfest-2026" } });
  });

  it("refuses the edition already public, an unknown one and an organizer", async () => {
    const { deps } = setup([edition("devfest-2026"), edition("meetup-nov")]);

    expect(await publishEdition(deps, GLOBAL, { id: "devfest-2026" })).toEqual(err({ code: "already-public" }));
    expect(await publishEdition(deps, GLOBAL, { id: "ghost" })).toEqual(err({ code: "not-found" }));
    expect(await publishEdition(deps, ORGANIZER, { id: "meetup-nov" })).toEqual(err({ code: "forbidden" }));
    expect(deps.catalog.publish).not.toHaveBeenCalled();
  });
});

describe("listEditionChoices", () => {
  it("names every edition or only the allowed ones, with their stage, the public one first", async () => {
    const { deps } = setup([
      edition("old", { endsAt: new Date(-1000) }),
      edition("next", { startsAt: new Date("2026-11-20") }),
      edition("devfest-2026"),
      edition("closed", { status: "finished" }),
    ]);

    const all = await listEditionChoices(deps, "all");
    expect(all.ok && all.value.map((choice) => [choice.id, choice.stage])).toEqual([
      ["devfest-2026", "live"],
      ["next", "draft"],
      ["closed", "finished"],
      ["old", "finished"],
    ]);
    const some = await listEditionChoices(deps, ["next", "ghost"]);
    expect(some.ok && some.value.map((choice) => choice.id)).toEqual(["next"]);
  });
});
