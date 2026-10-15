import { describe, expect, it, vi } from "vitest";
import { err, ok } from "@/shared/lib/result";
import { saveStoryTitle, type OdysseyAuditEntry, type StoryAdminDeps } from "./manage";
import { checkStoryTitle, getStoryTitle, parseStoryTitle } from "./story";

vi.mock("@/shared/lib/log", () => ({ logServerError: vi.fn() }));

describe("story title rules", () => {
  it("trims, keeps single spaces, clears on blank and refuses titles out of 3 to 40 characters", () => {
    expect(checkStoryTitle("  Odisea   de  Código ")).toEqual({ ok: true, value: "Odisea de Código" });
    expect(checkStoryTitle("   ")).toEqual({ ok: true, value: null });
    expect(checkStoryTitle("ab")).toEqual({ ok: false });
    expect(checkStoryTitle("x".repeat(41))).toEqual({ ok: false });
    expect(checkStoryTitle(7)).toEqual({ ok: false });
  });

  it("reads a stored title, or none when it is missing or broken", () => {
    expect(parseStoryTitle({ title: "La isla del tesoro" })).toBe("La isla del tesoro");
    expect(parseStoryTitle({ title: null })).toBeNull();
    expect(parseStoryTitle({ title: "x" })).toBeNull();
    expect(parseStoryTitle(undefined)).toBeNull();
  });

  it("falls back to the generic name when the title cannot be read", async () => {
    expect(await getStoryTitle({ readTitle: async () => ok("Odisea") })).toBe("Odisea");
    expect(await getStoryTitle({ readTitle: async () => err({ code: "unknown" }) })).toBeNull();
  });
});

describe("saveStoryTitle", () => {
  function setup(saved = true) {
    const entries: OdysseyAuditEntry[] = [];
    const deps = {
      titles: { readTitle: vi.fn(async () => ok(null)), saveTitle: vi.fn(async () => (saved ? ok(undefined) : err({ code: "unknown" }))) },
      audit: { append: vi.fn(async (entry: OdysseyAuditEntry) => (entries.push(entry), ok(undefined))) },
      now: () => new Date(0),
    } satisfies StoryAdminDeps;
    return { deps, entries };
  }
  const ADMIN = { uid: "a1", role: "admin" } as const;

  it("saves the tidy title and audits it, or clears it with a blank one", async () => {
    const { deps, entries } = setup();

    expect(await saveStoryTitle(deps, ADMIN, { title: " La  isla del tesoro " })).toEqual(ok("La isla del tesoro"));
    expect(deps.titles.saveTitle).toHaveBeenCalledWith("La isla del tesoro");
    expect(entries[0]).toMatchObject({ action: "story.titled", actorUid: "a1", details: { title: "La isla del tesoro" } });

    expect(await saveStoryTitle(deps, ADMIN, { title: "" })).toEqual(ok(null));
    expect(deps.titles.saveTitle).toHaveBeenLastCalledWith(null);
  });

  it("refuses non-admins, bad titles and reports a failed write without auditing", async () => {
    const { deps, entries } = setup(false);

    expect(await saveStoryTitle(deps, { uid: "s1", role: "staff" }, { title: "Odisea" })).toEqual(err({ code: "forbidden" }));
    expect(await saveStoryTitle(deps, ADMIN, { title: "ab" })).toEqual(err({ code: "invalid-story-title" }));
    expect(await saveStoryTitle(deps, ADMIN, { title: "Odisea" })).toEqual(err({ code: "unknown" }));
    expect(entries).toEqual([]);
  });
});
