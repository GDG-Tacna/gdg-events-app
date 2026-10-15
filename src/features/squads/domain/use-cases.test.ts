import { describe, expect, it, vi } from "vitest";
import type { Analytics } from "@/shared/lib/analytics/analytics";
import { err, ok, type Result } from "@/shared/lib/result";
import type { AssignOutcome, SquadCatalog, SquadPicker, SquadRepository } from "./ports";
import type { Squad } from "./squad";
import { squadError, type SquadError } from "./squad-error";
import { assignSquad, listSquads, type AssignSquadDeps } from "./use-cases";

const sprite = { rows: ["x"], palette: { x: "#000000" } };
const squad = (id: string, active = true): Squad => ({ id, name: `Escuadrón ${id}`, tagline: "t", sprite, active });
const OFFERED = [squad("angular"), squad("firebase"), squad("gemini")];

interface Setup {
  outcome?: Result<AssignOutcome, SquadError>;
  catalog?: Result<readonly Squad[], SquadError>;
  picked?: string;
}

function setup({ outcome = ok({ kind: "assigned", squad: "gemini" }), catalog = ok(OFFERED), picked = "gemini" }: Setup = {}) {
  const squads: SquadRepository = { assignIfUnassigned: vi.fn(async () => outcome) };
  const catalogPort: SquadCatalog = { list: vi.fn(async () => catalog) };
  const analytics: Analytics = { track: vi.fn() };
  const pick = vi.fn<SquadPicker>(() => picked);
  const deps: AssignSquadDeps = { squads, catalog: catalogPort, analytics, pick };
  return { deps, squads, catalogPort, analytics, pick };
}

describe("assignSquad", () => {
  it("picks among the squads the catalog offers, assigns it and counts it once", async () => {
    const t = setup();

    const result = await assignSquad(t.deps, "u1");

    expect(result).toEqual(ok({ squad: "gemini", assigned: true }));
    expect(t.pick).toHaveBeenCalledWith(["angular", "firebase", "gemini"]);
    expect(t.squads.assignIfUnassigned).toHaveBeenCalledWith("u1", "gemini");
    expect(t.analytics.track).toHaveBeenCalledWith({ name: "squad_assigned", uid: "u1", squad: "gemini" });
  });

  it("only ever picks from active squads: a retired one stays in the catalog but is never offered", async () => {
    const t = setup({ catalog: ok([squad("angular"), squad("firebase", false), squad("gemini")]) });

    await assignSquad(t.deps, "u1");

    expect(t.pick).toHaveBeenCalledWith(["angular", "gemini"]);
  });

  it("keeps the existing squad when the attendee already has one, and does not count it again", async () => {
    // The draw said gemini, but the stored squad wins: a repeat call must never reshuffle the attendee.
    const t = setup({ outcome: ok({ kind: "already-assigned", squad: "firebase" }), picked: "gemini" });

    const result = await assignSquad(t.deps, "u1");

    expect(result).toEqual(ok({ squad: "firebase", assigned: false }));
    expect(t.analytics.track).not.toHaveBeenCalled();
  });

  it("keeps a squad that has since been retired from the catalog", async () => {
    const t = setup({
      catalog: ok([squad("angular"), squad("gemini")]),
      outcome: ok({ kind: "already-assigned", squad: "cloud" }),
    });

    expect(await assignSquad(t.deps, "u1")).toEqual(ok({ squad: "cloud", assigned: false }));
  });

  it.each([[[]], [[squad("angular", false), squad("gemini", false)]]])("reports the feature as unavailable when no squad is on offer (%#), without touching storage", async (offered) => {
    const t = setup({ catalog: ok(offered) });

    expect(await assignSquad(t.deps, "u1")).toEqual(err(squadError("disabled")));
    expect(t.pick).not.toHaveBeenCalled();
    expect(t.squads.assignIfUnassigned).not.toHaveBeenCalled();
  });

  it("surfaces a catalog failure without touching storage", async () => {
    const t = setup({ catalog: err(squadError("unknown")) });

    expect(await assignSquad(t.deps, "u1")).toEqual(err(squadError("unknown")));
    expect(t.squads.assignIfUnassigned).not.toHaveBeenCalled();
  });

  it("reports an attendee without a profile and counts nothing", async () => {
    const t = setup({ outcome: err(squadError("not-registered")) });

    expect(await assignSquad(t.deps, "u1")).toEqual(err(squadError("not-registered")));
    expect(t.analytics.track).not.toHaveBeenCalled();
  });

  it("surfaces a storage failure", async () => {
    const t = setup({ outcome: err(squadError("unknown")) });

    expect(await assignSquad(t.deps, "u1")).toEqual(err(squadError("unknown")));
    expect(t.analytics.track).not.toHaveBeenCalled();
  });
});

describe("listSquads", () => {
  it("returns what the catalog offers", async () => {
    const t = setup();

    expect(await listSquads({ catalog: t.catalogPort })).toEqual(ok(OFFERED));
  });
});
