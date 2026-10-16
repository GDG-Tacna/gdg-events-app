import { describe, expect, it, vi } from "vitest";
import { err, ok } from "@/shared/lib/result";
import { createSpeaker, listManagedSpeakers, setSpeakerActive, updateSpeaker, type SpeakerAdminDeps, type SpeakerPatch } from "./manage";
import { checkSpeaker, suggestSpeakerId, type Speaker, type SpeakerDraft } from "./speaker";

vi.mock("@/shared/lib/log", () => ({ logServerError: vi.fn() }));

const ADMIN = { uid: "a1", role: "admin" };
const PHOTO = "public/e1/speaker/abcdef123456.webp";
const DRAFT: SpeakerDraft = {
  name: "  Ana   Torres ",
  headline: " GDE Firebase ",
  bio: "  Construye apps.  ",
  links: { linkedin: "https://www.linkedin.com/in/ana", github: "", web: " https://ana.dev " },
};

describe("speaker rules", () => {
  it("tidies what the admin typed and keeps only https links", () => {
    expect(checkSpeaker("ana-torres", DRAFT)).toEqual(
      ok({ id: "ana-torres", name: "Ana Torres", headline: "GDE Firebase", bio: "Construye apps.", links: { linkedin: "https://www.linkedin.com/in/ana", github: null, web: "https://ana.dev/" } }),
    );
  });

  it.each([
    ["a bad id", "Ana Torres", DRAFT, "invalid-id"],
    ["a short name", "ana", { ...DRAFT, name: "A" }, "invalid-name"],
    ["a long headline", "ana", { ...DRAFT, headline: "x".repeat(81) }, "invalid-headline"],
    ["a long bio", "ana", { ...DRAFT, bio: "x".repeat(501) }, "invalid-bio"],
    ["an http link", "ana", { ...DRAFT, links: { ...DRAFT.links, web: "http://ana.dev" } }, "invalid-link"],
    ["something that is not a link", "ana", { ...DRAFT, links: { ...DRAFT.links, github: "ana" } }, "invalid-link"],
  ] as const)("refuses %s", (_, id, draft, code) => {
    expect(checkSpeaker(id, draft)).toEqual(err(code));
  });

  it("suggests an id from the name", () => {
    expect(suggestSpeakerId("Ana Pérez Ñuñez")).toBe("ana-perez-nunez");
  });
});

function setup(initial: Speaker[] = []) {
  const rows = new Map(initial.map((speaker) => [speaker.id, speaker]));
  const deps = {
    store: {
      list: vi.fn(async () => ok([...rows.values()])),
      create: vi.fn(async (speaker: Speaker) => {
        if (rows.has(speaker.id)) return err({ code: "already-exists" as const });
        rows.set(speaker.id, speaker);
        return ok(undefined);
      }),
      update: vi.fn(async (id: string, patch: SpeakerPatch) => {
        const before = rows.get(id);
        if (!before) return ok(null);
        const after = { ...before, ...patch };
        rows.set(id, after);
        return ok({ before, after });
      }),
    },
    images: {
      ref: vi.fn((path: string, purpose: string) => (purpose === "speaker" && path.startsWith("public/e1/speaker/") ? { path, url: `/media/${path}` } : null)),
      remove: vi.fn(async () => undefined),
    },
    audit: { append: vi.fn(async () => ok(undefined)) },
    now: () => new Date(0),
  } satisfies SpeakerAdminDeps;
  return { deps, rows };
}

const ANA: Speaker = { id: "ana-torres", name: "Ana Torres", headline: "", bio: "", photo: null, links: { linkedin: null, github: null, web: null }, active: true };

describe("speaker administration", () => {
  it("is for admins only", async () => {
    const t = setup([ANA]);
    const staff = { uid: "s1", role: "staff" };

    expect(await listManagedSpeakers(t.deps, staff)).toEqual(err({ code: "forbidden" }));
    expect(await createSpeaker(t.deps, staff, { id: "x1", draft: DRAFT, photoPath: null })).toEqual(err({ code: "forbidden" }));
    expect(await setSpeakerActive(t.deps, staff, { id: "ana-torres", active: false })).toEqual(err({ code: "forbidden" }));
  });

  it("creates an active speaker with a photo uploaded for a speaker, and audits it", async () => {
    const t = setup();

    const created = await createSpeaker(t.deps, ADMIN, { id: "ana-torres", draft: DRAFT, photoPath: PHOTO });

    expect(created).toMatchObject({ ok: true, value: { id: "ana-torres", name: "Ana Torres", photo: { path: PHOTO }, active: true } });
    expect(t.deps.audit.append).toHaveBeenCalledWith(expect.objectContaining({ action: "speaker.created", targetUid: "ana-torres" }));
  });

  it("refuses a photo of another kind and a taken id", async () => {
    const t = setup([ANA]);

    expect(await createSpeaker(t.deps, ADMIN, { id: "luis", draft: DRAFT, photoPath: "public/e1/badge/abcdef123456.webp" })).toEqual(err({ code: "invalid-image" }));
    expect(await createSpeaker(t.deps, ADMIN, { id: "ana-torres", draft: DRAFT, photoPath: null })).toEqual(err({ code: "already-exists" }));
  });

  it("updates keeping the photo unless told, deletes a replaced one, and audits what changed", async () => {
    const t = setup([{ ...ANA, photo: { path: PHOTO, url: `/media/${PHOTO}` } }]);

    const kept = await updateSpeaker(t.deps, ADMIN, { id: "ana-torres", draft: { ...DRAFT, name: "Ana T." } });
    expect(kept).toMatchObject({ ok: true, value: { name: "Ana T.", photo: { path: PHOTO } } });
    expect(t.deps.images.remove).not.toHaveBeenCalled();

    const removed = await updateSpeaker(t.deps, ADMIN, { id: "ana-torres", draft: DRAFT, photoPath: null });
    expect(removed).toMatchObject({ ok: true, value: { photo: null } });
    expect(t.deps.images.remove).toHaveBeenCalledWith(PHOTO);
    expect(t.deps.audit.append).toHaveBeenLastCalledWith(expect.objectContaining({ action: "speaker.updated", details: { changed: expect.stringContaining("photo") } }));
    expect(await updateSpeaker(t.deps, ADMIN, { id: "ghost", draft: DRAFT })).toEqual(err({ code: "not-found" }));
  });

  it("lists alphabetically and stops offering a speaker, auditing only a real change", async () => {
    const t = setup([{ ...ANA, id: "zoe", name: "Zoe" }, ANA]);

    const listed = await listManagedSpeakers(t.deps, ADMIN);
    expect(listed.ok && listed.value.map((speaker) => speaker.name)).toEqual(["Ana Torres", "Zoe"]);

    await setSpeakerActive(t.deps, ADMIN, { id: "ana-torres", active: false });
    await setSpeakerActive(t.deps, ADMIN, { id: "ana-torres", active: false });
    expect(t.deps.audit.append).toHaveBeenCalledTimes(1);
    expect(t.deps.audit.append).toHaveBeenCalledWith(expect.objectContaining({ action: "speaker.deactivated" }));
  });
});
