import { beforeEach, describe, expect, it, vi } from "vitest";
import { err, ok } from "@/shared/lib/result";
import type { Edition } from "./editions";
import { resetEditionProgress, type ProgressResetDeps } from "./progress-reset";

const NOW = new Date("2026-11-20T15:00:00Z");
const GLOBAL = { uid: "a1", role: "admin", adminScope: "global" as const };
const live: Edition = { id: "devfest-2026", name: "DevFest 2026", venue: null, startsAt: null, endsAt: null, status: "draft" };
const old: Edition = { ...live, id: "devfest-2025", status: "finished" };

function setup(editions: readonly Edition[] = [live, old]) {
  const deps = {
    catalog: { list: vi.fn(async () => ok(editions)) },
    resetter: { reset: vi.fn(async () => ok({ cadets: 120, documents: 840 })) },
    audit: { append: vi.fn(async () => ok(undefined)) },
    now: () => NOW,
  } satisfies ProgressResetDeps;
  return deps;
}

beforeEach(() => vi.spyOn(console, "error").mockImplementation(() => undefined));

describe("resetEditionProgress", () => {
  it("cleans the edition's progress and answers how many cadets started again, leaving an entry in the audit trail", async () => {
    const deps = setup();

    expect(await resetEditionProgress(deps, GLOBAL, { eventId: "devfest-2026" })).toEqual(ok({ cadets: 120, documents: 840 }));
    expect(deps.resetter.reset).toHaveBeenCalledWith("devfest-2026");
    expect(deps.audit.append).toHaveBeenCalledWith({ action: "event.progress-reset", actorUid: "a1", targetUid: "devfest-2026", details: { cadets: "120", documents: "840" }, at: NOW });
  });

  it("is only for an admin of every edition: an organizer, staff, a cadet or nobody are refused before anything is read", async () => {
    const deps = setup();

    for (const actor of [{ uid: "o1", role: "admin", adminScope: "edition" as const }, { uid: "s1", role: "staff" }, { uid: "c1", role: "attendee" }, { uid: "x", role: null }, { uid: "a2", role: "admin" }]) {
      expect(await resetEditionProgress(deps, actor, { eventId: "devfest-2026" })).toEqual(err({ code: "forbidden" }));
    }
    expect(deps.catalog.list).not.toHaveBeenCalled();
    expect(deps.resetter.reset).not.toHaveBeenCalled();
  });

  it("refuses an edition that does not exist, and a finished one whose results are history", async () => {
    const deps = setup();

    expect(await resetEditionProgress(deps, GLOBAL, { eventId: "ghost" })).toEqual(err({ code: "not-found" }));
    expect(await resetEditionProgress(deps, GLOBAL, { eventId: "devfest-2025" })).toEqual(err({ code: "finished" }));
    expect(deps.resetter.reset).not.toHaveBeenCalled();
    expect(deps.audit.append).not.toHaveBeenCalled();
  });

  it("reports a catalog that cannot be read, and a clean that fails, without writing an audit entry for what was not done", async () => {
    const deps = setup();
    deps.catalog.list.mockResolvedValueOnce(err({ code: "down" }) as never);
    expect(await resetEditionProgress(deps, GLOBAL, { eventId: "devfest-2026" })).toEqual(err({ code: "unknown" }));

    deps.resetter.reset.mockResolvedValueOnce(err({ code: "down" }) as never);
    expect(await resetEditionProgress(deps, GLOBAL, { eventId: "devfest-2026" })).toEqual(err({ code: "unknown" }));
    expect(deps.audit.append).not.toHaveBeenCalled();
  });

  it("keeps the clean that already happened when only the audit entry fails", async () => {
    const deps = setup();
    deps.audit.append.mockResolvedValueOnce(err({ code: "down" }) as never);

    expect(await resetEditionProgress(deps, GLOBAL, { eventId: "devfest-2026" })).toEqual(ok({ cadets: 120, documents: 840 }));
    expect(console.error).toHaveBeenCalled();
  });
});
