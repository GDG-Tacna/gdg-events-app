import { beforeEach, describe, expect, it, vi } from "vitest";
import { err, ok, type Result } from "@/shared/lib/result";
import type { RankingEntry } from "./ranking";
import { DEFAULT_STAGE, championsOf, getStage, parseStageCommand, parseStageState, presentRaffle, updateStage, type StageDeps, type StageState } from "./stage";

const NOW = new Date("2026-10-24T22:40:00Z");
const ADMIN = { uid: "a1", role: "admin" };
const entry = (uid: string, xp: number, squadId: string | null = null): RankingEntry => ({ uid, alias: `Alias-${uid}`, squadId, xp, reachedAt: null });

function setup(saved: StageState | null = null) {
  let stored = saved;
  const entries: unknown[] = [];
  const deps = {
    ranking: {
      top: vi.fn(async (): Promise<Result<readonly RankingEntry[], { code: string }>> => ok([entry("nova", 500, "firebase"), entry("orion", 300)])),
      placeOf: vi.fn(),
      total: vi.fn(),
      squadTotals: vi.fn(async (): Promise<Result<ReadonlyMap<string, { xp: number; members: number }>, { code: string }>> => ok(new Map([["firebase", { xp: 500, members: 2 }]]))),
    },
    squads: { list: vi.fn(async () => ok([{ id: "firebase", name: "Escuadrón Firebase", active: true }])) },
    stage: {
      read: vi.fn(async (): Promise<Result<StageState | null, { code: string }>> => ok(stored)),
      save: vi.fn(async (state: StageState): Promise<Result<void, { code: string }>> => ((stored = state), ok(undefined))),
    },
    audit: { append: vi.fn(async (entry: unknown) => (entries.push(entry), ok(undefined))) },
    now: () => NOW,
  } satisfies StageDeps;
  return { deps, entries, stored: () => stored };
}

const BOARD = {
  cadets: [
    { position: 1, alias: "Alias-nova", squad: "Escuadrón Firebase", xp: 500 },
    { position: 2, alias: "Alias-orion", squad: null, xp: 300 },
  ],
  squads: [{ position: 1, id: "firebase", name: "Escuadrón Firebase", xp: 500, members: 2 }],
};

describe("stage commands", () => {
  let ctx: ReturnType<typeof setup>;
  beforeEach(() => {
    ctx = setup();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("starts on the live ranking with both views", async () => {
    expect(await getStage(ctx.deps)).toEqual(ok(DEFAULT_STAGE));
  });

  it("switches to the waiting screen and back, and changes the view, auditing each change", async () => {
    expect(await updateStage(ctx.deps, ADMIN, { type: "show", display: "waiting" })).toEqual(ok({ ...DEFAULT_STAGE, display: "waiting" }));
    expect(await updateStage(ctx.deps, ADMIN, { type: "view", view: "squads" })).toMatchObject({ ok: true, value: { display: "waiting", view: "squads" } });
    expect(await updateStage(ctx.deps, ADMIN, { type: "show", display: "ranking" })).toMatchObject({ ok: true, value: { display: "ranking", view: "squads" } });

    expect(ctx.entries).toHaveLength(3);
    expect(ctx.entries[0]).toEqual({ action: "stage.updated", actorUid: "a1", targetUid: "stage", details: { command: "show", display: "waiting", view: "both", frozen: "no" }, at: NOW });
  });

  it("freezes the ranking as it stands, keeps the first moment, and unfreezes", async () => {
    expect(await updateStage(ctx.deps, ADMIN, { type: "freeze" })).toEqual(ok({ ...DEFAULT_STAGE, frozen: { ...BOARD, at: NOW } }));

    ctx.deps.ranking.top.mockResolvedValue(ok([entry("orion", 900)]));
    expect(await updateStage(ctx.deps, ADMIN, { type: "freeze" })).toMatchObject({ ok: true, value: { frozen: { cadets: BOARD.cadets } } });
    // Freezing again changes nothing, so nothing is saved or audited.
    expect(ctx.deps.stage.save).toHaveBeenCalledTimes(1);
    expect(ctx.entries).toHaveLength(1);

    expect(await updateStage(ctx.deps, ADMIN, { type: "unfreeze" })).toMatchObject({ ok: true, value: { frozen: null } });
    expect(await updateStage(ctx.deps, ADMIN, { type: "unfreeze" })).toEqual(err({ code: "not-frozen" }));
  });

  it("reveals the champions from the frozen ranking, so they match what was on screen", async () => {
    await updateStage(ctx.deps, ADMIN, { type: "freeze" });
    ctx.deps.ranking.top.mockResolvedValue(ok([entry("orion", 900)]));

    const revealed = await updateStage(ctx.deps, ADMIN, { type: "reveal" });

    expect(revealed).toMatchObject({ ok: true, value: { display: "reveal", champions: { cadet: BOARD.cadets[0], squad: BOARD.squads[0] } } });
  });

  it("reveals the champions of the live ranking when it is not frozen, and drops them when going back", async () => {
    expect(await updateStage(ctx.deps, ADMIN, { type: "reveal" })).toMatchObject({ ok: true, value: { display: "reveal", champions: { cadet: { alias: "Alias-nova" } } } });

    expect(await updateStage(ctx.deps, ADMIN, { type: "show", display: "ranking" })).toMatchObject({ ok: true, value: { display: "ranking", champions: null } });
  });

  it("refuses anyone but an admin, and anything that is not a command", async () => {
    expect(await updateStage(ctx.deps, { uid: "s1", role: "staff" }, { type: "freeze" })).toEqual(err({ code: "forbidden" }));
    for (const input of [null, { type: "explode" }, { type: "show", display: "reveal" }, { type: "view", view: "all" }]) {
      expect(await updateStage(ctx.deps, ADMIN, input)).toEqual(err({ code: "invalid-command" }));
    }
    expect(ctx.deps.stage.save).not.toHaveBeenCalled();
  });

  it("reports failed reads and writes, and keeps a change whose audit line failed", async () => {
    ctx.deps.stage.read.mockResolvedValueOnce(err({ code: "x" }));
    expect(await updateStage(ctx.deps, ADMIN, { type: "freeze" })).toEqual(err({ code: "unknown" }));

    ctx.deps.ranking.top.mockResolvedValueOnce(err({ code: "x" }));
    expect(await updateStage(ctx.deps, ADMIN, { type: "freeze" })).toEqual(err({ code: "unknown" }));
    ctx.deps.ranking.top.mockResolvedValueOnce(err({ code: "x" }));
    expect(await updateStage(ctx.deps, ADMIN, { type: "reveal" })).toEqual(err({ code: "unknown" }));

    ctx.deps.stage.save.mockResolvedValueOnce(err({ code: "x" }));
    expect(await updateStage(ctx.deps, ADMIN, { type: "view", view: "cadets" })).toEqual(err({ code: "unknown" }));

    ctx.deps.audit.append.mockResolvedValueOnce(err({ code: "x" }) as never);
    expect(await updateStage(ctx.deps, ADMIN, { type: "view", view: "cadets" })).toMatchObject({ ok: true });
    expect(console.error).toHaveBeenCalled();
  });
});

describe("championsOf", () => {
  it("takes the first cadet and the first squad with XP, or none", () => {
    expect(championsOf(BOARD)).toEqual({ cadet: BOARD.cadets[0], squad: BOARD.squads[0] });
    expect(championsOf({ cadets: [], squads: [{ ...BOARD.squads[0], xp: 0 }] })).toEqual({ cadet: null, squad: null });
  });
});

describe("parseStageCommand", () => {
  it("reads each command", () => {
    expect(parseStageCommand({ type: "show", display: "ranking" })).toEqual({ type: "show", display: "ranking" });
    expect(parseStageCommand({ type: "view", view: "both" })).toEqual({ type: "view", view: "both" });
    expect(parseStageCommand({ type: "reveal", extra: 1 })).toEqual({ type: "reveal" });
  });
});

describe("parseStageState", () => {
  const stored = { display: "ranking", view: "both", frozen: { ...BOARD, at: { toDate: () => NOW } }, champions: { cadet: BOARD.cadets[0], squad: null } };

  it("reads a stored stage, with dates as timestamps, dates or text", () => {
    expect(parseStageState(stored)).toEqual({ display: "ranking", view: "both", frozen: { ...BOARD, at: NOW }, champions: { cadet: BOARD.cadets[0], squad: null }, raffle: null });
    expect(parseStageState({ ...stored, frozen: { ...BOARD, at: NOW.toISOString() } })?.frozen?.at).toEqual(NOW);
    expect(parseStageState({ display: "waiting", view: "cadets" })).toEqual({ display: "waiting", view: "cadets", frozen: null, champions: null, raffle: null });
  });

  it.each([
    ["an unknown display", { ...stored, display: "fireworks" }],
    ["an unknown view", { ...stored, view: "all" }],
    ["a frozen ranking without its moment", { ...stored, frozen: BOARD }],
    ["a frozen cadet without XP", { ...stored, frozen: { ...BOARD, at: NOW, cadets: [{ position: 1, alias: "x" }] } }],
    ["a broken champion", { ...stored, champions: { cadet: { alias: 3 }, squad: null } }],
    ["not an object", "ranking"],
  ])("refuses %s", (_, input) => {
    expect(parseStageState(input)).toBeNull();
  });
});

describe("presentRaffle", () => {
  const SHOWING = { drawId: "polera-1", prizeName: "Polera", prizeImageUrl: null, winnerAlias: "Nova", winnerSquadId: "firebase", tickets: 10, totalTickets: 40, reel: ["Orion", "Nova"], at: NOW };

  it("puts the draw on the stage with the winner's squad named, giving way to a reveal", async () => {
    const ctx = setup({ ...DEFAULT_STAGE, display: "reveal", champions: { cadet: null, squad: null } });

    const shown = await presentRaffle(ctx.deps, SHOWING);

    expect(shown).toEqual(
      ok({
        ...DEFAULT_STAGE,
        display: "raffle",
        champions: null,
        raffle: { drawId: "polera-1", prizeName: "Polera", prizeImageUrl: null, winner: { alias: "Nova", squad: "Escuadrón Firebase" }, tickets: 10, totalTickets: 40, reel: ["Orion", "Nova"], at: NOW },
      }),
    );
    expect(ctx.stored()).toMatchObject({ display: "raffle" });
  });

  it("names no squad when the winner has none or the squads cannot be read, and reports a failed save", async () => {
    const ctx = setup();
    expect(await presentRaffle(ctx.deps, { ...SHOWING, winnerSquadId: null })).toMatchObject({ ok: true, value: { raffle: { winner: { squad: null } } } });
    ctx.deps.squads.list.mockResolvedValueOnce(err({ code: "x" }) as never);
    expect(await presentRaffle(ctx.deps, SHOWING)).toMatchObject({ ok: true, value: { raffle: { winner: { squad: null } } } });

    ctx.deps.stage.save.mockResolvedValueOnce(err({ code: "x" }));
    expect(await presentRaffle(ctx.deps, SHOWING)).toEqual(err({ code: "unknown" }));
    ctx.deps.stage.read.mockResolvedValueOnce(err({ code: "x" }));
    expect(await presentRaffle(ctx.deps, SHOWING)).toEqual(err({ code: "unknown" }));
  });

  it("drops the draw when the admin goes back to the ranking or reveals the champions", async () => {
    const ctx = setup();
    await presentRaffle(ctx.deps, SHOWING);

    expect(await updateStage(ctx.deps, ADMIN, { type: "show", display: "ranking" })).toMatchObject({ ok: true, value: { display: "ranking", raffle: null } });
    await presentRaffle(ctx.deps, SHOWING);
    expect(await updateStage(ctx.deps, ADMIN, { type: "reveal" })).toMatchObject({ ok: true, value: { display: "reveal", raffle: null } });
  });

  it("reads a stored draw back, and refuses a broken one", () => {
    const stored = { display: "raffle", view: "both", raffle: { ...SHOWING, winner: { alias: "Nova", squad: null }, at: NOW.toISOString() } };

    expect(parseStageState(stored)?.raffle).toEqual({ drawId: "polera-1", prizeName: "Polera", prizeImageUrl: null, winner: { alias: "Nova", squad: null }, tickets: 10, totalTickets: 40, reel: ["Orion", "Nova"], at: NOW });
    // The prize's photo is kept only as a web address; anything else leaves it out without dropping the draw.
    expect(parseStageState({ ...stored, raffle: { ...stored.raffle, prizeImageUrl: "https://cdn/p.webp" } })?.raffle?.prizeImageUrl).toBe("https://cdn/p.webp");
    expect(parseStageState({ ...stored, raffle: { ...stored.raffle, prizeImageUrl: "/media/public/e/raffle-prize/x1234567.webp" } })?.raffle?.prizeImageUrl).toBe("/media/public/e/raffle-prize/x1234567.webp");
    expect(parseStageState({ ...stored, raffle: { ...stored.raffle, prizeImageUrl: "javascript:alert(1)" } })?.raffle?.prizeImageUrl).toBeNull();
    expect(parseStageState({ ...stored, raffle: { ...stored.raffle, prizeImageUrl: "//evil.example/x.webp" } })?.raffle?.prizeImageUrl).toBeNull();
    expect(parseStageState({ ...stored, raffle: { ...stored.raffle, reel: [1] } })).toBeNull();
    expect(parseStageState({ ...stored, raffle: { ...stored.raffle, winner: null } })).toBeNull();
    expect(parseStageState({ ...stored, raffle: { ...stored.raffle, tickets: -1 } })).toBeNull();
  });
});
