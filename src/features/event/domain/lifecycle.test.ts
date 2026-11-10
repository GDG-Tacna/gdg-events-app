import { describe, expect, it } from "vitest";
import { lifecycleOf, mayDelete } from "./lifecycle";

const NOW = new Date("2026-11-10T12:00:00Z");
const edition = (extra: Partial<Parameters<typeof lifecycleOf>[0]> = {}) => ({ status: "draft" as const, endsAt: null, publishedAt: null, ...extra });

describe("lifecycleOf", () => {
  it("is a draft until it is made public", () => {
    expect(lifecycleOf(edition(), false, NOW)).toBe("draft");
    expect(lifecycleOf(edition({ endsAt: new Date("2026-12-01") }), false, NOW)).toBe("draft");
  });

  it("is published while it is the public edition", () => {
    expect(lifecycleOf(edition(), true, NOW)).toBe("published");
  });

  it("stays published for good once it was public, even after another edition takes over", () => {
    expect(lifecycleOf(edition({ publishedAt: new Date("2026-10-01") }), false, NOW)).toBe("published");
    // An edition made before this was remembered has no date: it reads as a draft until published again.
    expect(lifecycleOf({ status: "draft", endsAt: null }, false, NOW)).toBe("draft");
  });

  it("is finished when marked so or past its end, whether or not it was public", () => {
    expect(lifecycleOf(edition({ status: "finished" }), false, NOW)).toBe("finished");
    expect(lifecycleOf(edition({ status: "finished", publishedAt: new Date("2026-10-01") }), true, NOW)).toBe("finished");
    expect(lifecycleOf(edition({ endsAt: new Date("2026-11-10T12:00:00Z") }), true, NOW)).toBe("finished");
  });
});

describe("mayDelete", () => {
  const organizer = { role: "admin" as const, adminScope: "edition" as const };
  const global = { role: "admin" as const, adminScope: "global" as const };

  it("lets any admin delete in a draft", () => {
    expect(mayDelete("draft", organizer)).toBe(true);
    expect(mayDelete("draft", global)).toBe(true);
  });

  it("leaves a published or finished edition's items to the admin of every edition", () => {
    for (const lifecycle of ["published", "finished"] as const) {
      expect(mayDelete(lifecycle, organizer)).toBe(false);
      expect(mayDelete(lifecycle, global)).toBe(true);
    }
  });

  it("never lets staff, cadets or someone without a role delete, in any lifecycle", () => {
    for (const role of ["staff", "attendee", null] as const) {
      for (const lifecycle of ["draft", "published", "finished"] as const) expect(mayDelete(lifecycle, { role, adminScope: "global" })).toBe(false);
    }
  });
});
