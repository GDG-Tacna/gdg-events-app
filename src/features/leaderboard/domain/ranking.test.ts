import { describe, expect, it, vi } from "vitest";
import { err, ok, type Result } from "@/shared/lib/result";
import { compareEntries, computeFleetBoard, getCadetStanding, getFleetBoard, getSquadStandings, participantEntry, type LeaderboardDeps, type RankingEntry } from "./ranking";

const at = (minute: number) => new Date(Date.UTC(2026, 9, 24, 15, minute));
const entry = (uid: string, xp: number, minute: number | null, squadId: string | null = null): RankingEntry => ({
  uid,
  alias: `Alias-${uid}`,
  squadId,
  xp,
  reachedAt: minute === null ? null : at(minute),
});

function deps(overrides: Partial<{ top: RankingEntry[]; place: { xp: number; ahead: number } | null; total: number }> = {}) {
  return {
    ranking: {
      top: vi.fn(async (): Promise<Result<readonly RankingEntry[], { code: string }>> => ok(overrides.top ?? [entry("a", 300, 1, "firebase"), entry("me", 200, 2, "angular")])),
      placeOf: vi.fn(async (): Promise<Result<{ xp: number; ahead: number } | null, { code: string }>> => ok(overrides.place === undefined ? { xp: 200, ahead: 1 } : overrides.place)),
      total: vi.fn(async (): Promise<Result<number, { code: string }>> => ok(overrides.total ?? 42)),
      squadTotals: vi.fn(
        async (): Promise<Result<ReadonlyMap<string, { xp: number; members: number }>, { code: string }>> =>
          ok(
            new Map([
              ["angular", { xp: 900, members: 4 }],
              ["firebase", { xp: 900, members: 3 }],
              ["gemini", { xp: 1200, members: 5 }],
              ["retired", { xp: 0, members: 0 }],
            ]),
          ),
      ),
    },
    squads: {
      list: vi.fn(async (): Promise<Result<ReadonlyArray<{ id: string; name: string; active: boolean }>, { code: string }>> =>
        ok([
          { id: "angular", name: "Escuadrón Angular", active: true },
          { id: "firebase", name: "Escuadrón Firebase", active: true },
          { id: "gemini", name: "Escuadrón Gemini", active: true },
          { id: "retired", name: "Retirado", active: false },
        ]),
      ),
    },
  } satisfies LeaderboardDeps;
}

describe("compareEntries", () => {
  it("puts more XP first, then whoever reached it first, unknown last, then the alias", () => {
    const sorted = [entry("late", 100, 9), entry("unknown", 100, null), entry("top", 500, 50), entry("early", 100, 1), { ...entry("b", 100, null), alias: "Beta" }, { ...entry("a", 100, null), alias: "Alfa" }].sort(compareEntries);

    expect(sorted.map((e) => e.uid)).toEqual(["top", "early", "late", "a", "unknown", "b"]);
  });
});

describe("getCadetStanding", () => {
  it("answers the cadet's place, the number of cadets and the top with squad names, marking the cadet", async () => {
    expect(await getCadetStanding(deps(), "me")).toEqual(
      ok({
        position: 2,
        xp: 200,
        total: 42,
        top: [
          { position: 1, alias: "Alias-a", squad: "Escuadrón Firebase", xp: 300, isMe: false },
          { position: 2, alias: "Alias-me", squad: "Escuadrón Angular", xp: 200, isMe: true },
        ],
      }),
    );
  });

  it("gives no place to a cadet without XP, or one not registered", async () => {
    expect(await getCadetStanding(deps({ place: { xp: 0, ahead: 0 } }), "me")).toMatchObject({ ok: true, value: { position: null, xp: 0 } });
    expect(await getCadetStanding(deps({ place: null }), "ghost")).toMatchObject({ ok: true, value: { position: null, xp: 0 } });
  });

  it("still ranks without squad names when the squads cannot be read", async () => {
    const d = deps();
    d.squads.list.mockResolvedValue(err({ code: "x" }));

    expect(await getCadetStanding(d, "me")).toMatchObject({ ok: true, value: { top: [{ squad: null }, { squad: null }] } });
  });

  it.each(["top", "placeOf", "total"] as const)("reports a failed read of the %s", async (part) => {
    const d = deps();
    d.ranking[part].mockResolvedValue(err({ code: "x" }) as never);

    expect(await getCadetStanding(d, "me")).toEqual(err({ code: "unknown" }));
  });
});

describe("getSquadStandings", () => {
  it("ranks squads by their members' XP, ties to the smaller squad, retired squads only with members", async () => {
    const d = deps();

    expect(await getSquadStandings(d)).toEqual(
      ok([
        { position: 1, id: "gemini", name: "Escuadrón Gemini", xp: 1200, members: 5 },
        { position: 2, id: "firebase", name: "Escuadrón Firebase", xp: 900, members: 3 },
        { position: 3, id: "angular", name: "Escuadrón Angular", xp: 900, members: 4 },
      ]),
    );
    expect(d.ranking.squadTotals).toHaveBeenCalledWith(["angular", "firebase", "gemini", "retired"]);
  });

  it("keeps a retired squad while it still has members, and shows a squad without totals at zero", async () => {
    const d = deps();
    d.ranking.squadTotals.mockResolvedValue(ok(new Map([["retired", { xp: 50, members: 1 }]])));

    const standings = await getSquadStandings(d);

    expect(standings.ok && standings.value.map((s) => [s.id, s.xp])).toEqual([
      ["retired", 50],
      ["angular", 0],
      ["firebase", 0],
      ["gemini", 0],
    ]);
  });

  it("reports failed reads", async () => {
    const d = deps();
    d.squads.list.mockResolvedValueOnce(err({ code: "x" }));
    expect(await getSquadStandings(d)).toEqual(err({ code: "unknown" }));
    d.ranking.squadTotals.mockResolvedValueOnce(err({ code: "x" }));
    expect(await getSquadStandings(d)).toEqual(err({ code: "unknown" }));
  });
});

describe("getFleetBoard", () => {
  it("answers the top cadets with squad names and every squad, without any uid", async () => {
    const board = await getFleetBoard(deps());

    expect(board).toMatchObject({
      ok: true,
      value: {
        cadets: [
          { position: 1, alias: "Alias-a", squad: "Escuadrón Firebase", xp: 300 },
          { position: 2, alias: "Alias-me", squad: "Escuadrón Angular", xp: 200 },
        ],
        squads: [{ id: "gemini" }, { id: "firebase" }, { id: "angular" }],
      },
    });
    expect(JSON.stringify(board)).not.toContain("uid");
  });

  it("reports a failed read of the top or the squads", async () => {
    const d = deps();
    d.ranking.top.mockResolvedValueOnce(err({ code: "x" }));
    expect(await getFleetBoard(d)).toEqual(err({ code: "unknown" }));
    d.squads.list.mockResolvedValue(err({ code: "x" }));
    expect(await getFleetBoard(d)).toEqual(err({ code: "unknown" }));
  });
});

describe("participantEntry", () => {
  it("reads a participant with or without XP, its squad and when it reached that XP", () => {
    expect(participantEntry("u1", { alias: "Nova", xp: 120, squad: "firebase", xpReachedAt: { toDate: () => at(3) } })).toEqual({ uid: "u1", alias: "Nova", squadId: "firebase", xp: 120, reachedAt: at(3) });
    expect(participantEntry("u2", { alias: "Cero", xp: 0, squad: "" })).toEqual({ uid: "u2", alias: "Cero", squadId: null, xp: 0, reachedAt: null });
    expect(participantEntry("u3", { alias: "Fecha", xp: 5, xpReachedAt: at(4) })?.reachedAt).toEqual(at(4));
  });

  it.each([
    ["no document", undefined],
    ["no alias", { xp: 10 }],
    ["negative XP", { alias: "x", xp: -1 }],
    ["XP as text", { alias: "x", xp: "10" }],
  ])("ignores %s", (_, data) => {
    expect(participantEntry("u", data as Record<string, unknown> | undefined)).toBeNull();
  });
});

describe("computeFleetBoard", () => {
  const squads = [
    { id: "angular", name: "Escuadrón Angular", active: true },
    { id: "firebase", name: "Escuadrón Firebase", active: true },
    { id: "old", name: "Retirado", active: false },
  ];

  it("ranks the top cadets with XP and totals every squad member, with the server's rules", () => {
    const entries = [entry("late", 300, 9, "angular"), entry("early", 300, 1, "firebase"), entry("cero", 0, null, "angular"), entry("solo", 50, 2)];

    expect(computeFleetBoard(entries, squads)).toEqual({
      cadets: [
        { position: 1, alias: "Alias-early", squad: "Escuadrón Firebase", xp: 300 },
        { position: 2, alias: "Alias-late", squad: "Escuadrón Angular", xp: 300 },
        { position: 3, alias: "Alias-solo", squad: null, xp: 50 },
      ],
      squads: [
        { position: 1, id: "firebase", name: "Escuadrón Firebase", xp: 300, members: 1 },
        { position: 2, id: "angular", name: "Escuadrón Angular", xp: 300, members: 2 },
      ],
    });
  });

  it("keeps only the top 10", () => {
    const entries = Array.from({ length: 14 }, (_, i) => entry(`u${i}`, 100 + i, i));

    expect(computeFleetBoard(entries, squads).cadets.map((c) => c.xp)).toEqual([113, 112, 111, 110, 109, 108, 107, 106, 105, 104]);
  });
});
