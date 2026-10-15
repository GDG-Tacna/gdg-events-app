import { describe, expect, it, vi } from "vitest";
import { err, ok, type Result } from "@/shared/lib/result";
import { copyEditionContent, withNeeds, type CopyDeps, type CopyPart, type EditionDocument } from "./copy";
import type { Edition } from "./editions";

vi.mock("@/shared/lib/log", () => ({ logServerError: vi.fn() }));

const GLOBAL = { uid: "a1", role: "admin", adminScope: "global" } as const;
const edition = (id: string): Edition => ({ id, name: id, venue: null, startsAt: null, endsAt: null, status: "draft" });
const IMG = "public/devfest-2026/mission/abcdef123456.webp";
const OLD_IMG = "public/devfest-2025/squad-logo/zzzzzzzz9999.svg";

/** Editions by id, each with documents by part. */
function setup(content: Record<string, Partial<Record<CopyPart, EditionDocument[]>>>) {
  const written: Array<{ eventId: string; documents: readonly EditionDocument[]; from: string }> = [];
  let next = 0;
  const deps = {
    catalog: { list: vi.fn(async () => ok(Object.keys(content).map(edition))), publicId: vi.fn(async () => ok("devfest-2026")) },
    copier: {
      isEmpty: vi.fn(async (eventId: string, part: CopyPart) => ok((content[eventId]?.[part] ?? []).length === 0)),
      read: vi.fn(async (eventId: string, part: CopyPart) => ok(content[eventId]?.[part] ?? [])),
      write: vi.fn(async (eventId: string, documents: readonly EditionDocument[], from: string) => (written.push({ eventId, documents, from }), ok(undefined))),
    },
    copyImage: vi.fn(async (path: string, to: string): Promise<Result<string | null, { code: string }>> => ok(path === "public/devfest-2026/mission/gone00000000.webp" ? null : `public/${to}/${path.split("/")[2]}/copy${(next += 1)}aaaaaaaa.webp`)),
    audit: { append: vi.fn(async () => ok(undefined)) },
    now: () => new Date(0),
  } satisfies CopyDeps;
  return { deps, written };
}

describe("withNeeds", () => {
  it("adds what a part points at, in the canonical order", () => {
    expect(withNeeds(["story"])).toEqual(["map", "checkpoints", "talks", "missions", "story"]);
    expect(withNeeds(["achievements", "ranks"])).toEqual(["squads", "map", "checkpoints", "talks", "missions", "achievements", "ranks"]);
    expect(withNeeds(["economy"])).toEqual(["economy"]);
  });
});

describe("copyEditionContent", () => {
  it("copies the chosen parts and what they need, with every image copied into the new edition", async () => {
    const t = setup({
      "devfest-2026": {
        missions: [{ path: "missions/ai-quiz", data: { title: "Quiz", imagePath: IMG, quadrantId: "ai" } }],
        map: [{ path: "quadrants/ai", data: { name: "AI" } }],
        ranks: [{ path: "config/ranks", data: { ranks: [{ id: "recruit", iconPath: OLD_IMG }, { id: "pilot", iconPath: null }] } }],
      },
      "meetup-nov": {},
    });

    const copied = await copyEditionContent(t.deps, GLOBAL, { from: "devfest-2026", to: "meetup-nov", parts: ["missions", "ranks"] });

    expect(copied).toEqual(ok({ parts: ["map", "checkpoints", "talks", "missions", "ranks"], documents: 3 }));
    expect(t.written).toHaveLength(1);
    expect(t.written[0].from).toBe("devfest-2026");
    const byPath = Object.fromEntries(t.written[0].documents.map((document) => [document.path, document.data]));
    expect(byPath["missions/ai-quiz"]).toEqual({ title: "Quiz", imagePath: "public/meetup-nov/mission/copy1aaaaaaaa.webp", quadrantId: "ai" });
    // An image the source inherited from an older edition is copied too.
    expect(byPath["config/ranks"]).toEqual({ ranks: [{ id: "recruit", iconPath: "public/meetup-nov/squad-logo/copy2aaaaaaaa.webp" }, { id: "pilot", iconPath: null }] });
    expect(t.deps.audit.append).toHaveBeenCalledWith(expect.objectContaining({ action: "event.copied", targetUid: "meetup-nov", details: expect.objectContaining({ from: "devfest-2026", documents: "3", images: "2" }) }));
  });

  it("copies an image once even when several documents use it, and drops one that no longer exists", async () => {
    const t = setup({
      "devfest-2026": {
        squads: [
          { path: "squads/a", data: { logoPath: IMG } },
          { path: "squads/b", data: { logoPath: IMG } },
          { path: "squads/c", data: { logoPath: "public/devfest-2026/mission/gone00000000.webp" } },
        ],
      },
      "meetup-nov": {},
    });

    await copyEditionContent(t.deps, GLOBAL, { from: "devfest-2026", to: "meetup-nov", parts: ["squads"] });

    expect(t.deps.copyImage).toHaveBeenCalledTimes(2);
    expect(t.written[0].documents.map((document) => document.data.logoPath)).toEqual(["public/meetup-nov/mission/copy1aaaaaaaa.webp", "public/meetup-nov/mission/copy1aaaaaaaa.webp", null]);
  });

  it("copies nothing when a part already has data in the destination, and names those parts", async () => {
    const t = setup({
      "devfest-2026": { missions: [{ path: "missions/x", data: {} }] },
      "meetup-nov": { map: [{ path: "quadrants/ai", data: {} }], talks: [{ path: "checkpoints/keynote", data: { kind: "talk" } }] },
    });

    expect(await copyEditionContent(t.deps, GLOBAL, { from: "devfest-2026", to: "meetup-nov", parts: ["missions"] })).toEqual(err({ code: "not-empty", parts: ["map", "talks"] }));
    expect(t.deps.copier.write).not.toHaveBeenCalled();
    expect(t.deps.copyImage).not.toHaveBeenCalled();
  });

  it("refuses an organizer, unknown parts, the same edition and an unknown edition", async () => {
    const t = setup({ "devfest-2026": {}, "meetup-nov": {} });

    expect(await copyEditionContent(t.deps, { uid: "o1", role: "admin", adminScope: "edition" }, { from: "devfest-2026", to: "meetup-nov", parts: ["squads"] })).toEqual(err({ code: "forbidden" }));
    expect(await copyEditionContent(t.deps, GLOBAL, { from: "devfest-2026", to: "meetup-nov", parts: [] })).toEqual(err({ code: "invalid-parts" }));
    expect(await copyEditionContent(t.deps, GLOBAL, { from: "devfest-2026", to: "meetup-nov", parts: ["participants"] })).toEqual(err({ code: "invalid-parts" }));
    expect(await copyEditionContent(t.deps, GLOBAL, { from: "meetup-nov", to: "meetup-nov", parts: ["squads"] })).toEqual(err({ code: "same-edition" }));
    expect(await copyEditionContent(t.deps, GLOBAL, { from: "ghost", to: "meetup-nov", parts: ["squads"] })).toEqual(err({ code: "not-found" }));
  });

  it("reports a failed image copy or write without auditing", async () => {
    const t = setup({ "devfest-2026": { missions: [{ path: "missions/x", data: { imagePath: IMG } }] }, "meetup-nov": {} });
    t.deps.copyImage.mockResolvedValueOnce(err({ code: "unknown" }));

    expect(await copyEditionContent(t.deps, GLOBAL, { from: "devfest-2026", to: "meetup-nov", parts: ["missions"] })).toEqual(err({ code: "unknown" }));
    expect(t.deps.audit.append).not.toHaveBeenCalled();
  });
});
