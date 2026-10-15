import { beforeEach, describe, expect, it, vi } from "vitest";
import { err, ok, type Result } from "@/shared/lib/result";
import {
  REEL_SIZE,
  buildReel,
  createRafflePrize,
  drawRafflePrize,
  eligibleEntrants,
  getCadetTickets,
  getRaffleOverview,
  parseRaffleSettings,
  pickWinner,
  saveRaffleSettings,
  updateRafflePrize,
  voidRaffleDraw,
  type Entrant,
  type NewDraw,
  type RaffleDeps,
  type RaffleDraw,
  type RaffleErrorCode,
  type RafflePrize,
  type RaffleSettings,
} from "./raffle";

const NOW = new Date("2026-10-24T23:50:00Z");
const ADMIN = { uid: "a1", role: "admin" } as const;
const entrant = (uid: string, credits: number, squadId: string | null = null): Entrant => ({ uid, alias: `Alias-${uid}`, squadId, credits });

/** An in-memory raffle store whose draw and void behave like the transactions. */
function memoryStore(prizes: RafflePrize[] = [], draws: RaffleDraw[] = [], settings: RaffleSettings | null = null) {
  const state = { prizes: new Map(prizes.map((p) => [p.id, p])), draws: new Map(draws.map((d) => [d.id, d])), settings, nextId: 1 };
  return {
    state,
    settings: vi.fn(async (): Promise<Result<RaffleSettings | null, { code: string }>> => ok(state.settings)),
    saveSettings: vi.fn(async (s: RaffleSettings): Promise<Result<void, { code: string }>> => ((state.settings = s), ok(undefined))),
    prizes: vi.fn(async (): Promise<Result<readonly RafflePrize[], { code: string }>> => ok([...state.prizes.values()])),
    createPrize: vi.fn(async (p: Omit<RafflePrize, "id">): Promise<Result<RafflePrize, { code: string }>> => {
      const prize = { ...p, id: `p${state.nextId++}` };
      state.prizes.set(prize.id, prize);
      return ok(prize);
    }),
    updatePrize: vi.fn(async (id: string, patch: Partial<RafflePrize>): Promise<Result<{ before: RafflePrize; after: RafflePrize } | null, { code: string }>> => {
      const before = state.prizes.get(id);
      if (!before) return ok(null);
      const after = { ...before, ...patch };
      state.prizes.set(id, after);
      return ok({ before, after });
    }),
    draws: vi.fn(async (): Promise<Result<readonly RaffleDraw[], { code: string }>> => ok([...state.draws.values()])),
    drawsOf: vi.fn(async (uid: string): Promise<Result<readonly RaffleDraw[], { code: string }>> => ok([...state.draws.values()].filter((d) => d.winnerUid === uid))),
    draw: vi.fn(async (prizeId: string, build: (p: RafflePrize, d: readonly RaffleDraw[]) => Result<NewDraw, { code: RaffleErrorCode }>): Promise<Result<RaffleDraw, { code: RaffleErrorCode | "unknown" }>> => {
      const prize = state.prizes.get(prizeId);
      if (!prize) return err({ code: "not-found" });
      const built = build(prize, [...state.draws.values()]);
      if (!built.ok) return built;
      const draw = { ...built.value, id: `${prizeId}-${prize.drawSeq + 1}`, prizeId, prizeName: prize.name, voided: false };
      state.draws.set(draw.id, draw);
      state.prizes.set(prizeId, { ...prize, awarded: prize.awarded + 1, drawSeq: prize.drawSeq + 1 });
      return ok(draw);
    }),
    voidDraw: vi.fn(async (drawId: string): Promise<Result<RaffleDraw, { code: RaffleErrorCode | "unknown" }>> => {
      const draw = state.draws.get(drawId);
      if (!draw) return err({ code: "not-found" });
      if (draw.voided) return err({ code: "already-voided" });
      const voided = { ...draw, voided: true };
      state.draws.set(drawId, voided);
      const prize = state.prizes.get(draw.prizeId)!;
      state.prizes.set(prize.id, { ...prize, awarded: prize.awarded - 1 });
      return ok(voided);
    }),
  };
}

const PRIZE: RafflePrize = { id: "polera", name: "Polera DevFest", quantity: 2, awarded: 0, drawSeq: 0, active: true, order: 0, image: null };

function setup(entrants: Entrant[] = [entrant("u1", 10, "firebase"), entrant("u2", 30), entrant("u3", 0), entrant("u4", 1)]) {
  const store = memoryStore([PRIZE]);
  const audits: unknown[] = [];
  const deps = {
    store,
    entrants: { list: vi.fn(async (): Promise<Result<readonly Entrant[], { code: string }>> => ok(entrants)) },
    random: vi.fn((max: number) => max - 1),
    images: { ref: vi.fn((path: string, purpose: string) => (path.includes(`/${purpose}/`) ? { path, url: `https://cdn/${path}` } : null)), remove: vi.fn(async () => {}) },
    stage: { present: vi.fn(async (): Promise<Result<void, { code: string }>> => ok(undefined)) },
    audit: { append: vi.fn(async (entry: unknown) => (audits.push(entry), ok(undefined))) },
    now: () => NOW,
  } satisfies RaffleDeps;
  return { deps, store, audits };
}

describe("raffle rules", () => {
  it("reads settings with a whole minimum of 1 to 10000", () => {
    expect(parseRaffleSettings({ minCredits: 5 })).toEqual({ minCredits: 5 });
    for (const minCredits of [0, 10_001, 2.5, "5"]) expect(parseRaffleSettings({ minCredits })).toBeNull();
  });

  it("lets in cadets with the minimum who have not been drawn, voided draws included", () => {
    const entrants = [entrant("a", 5), entrant("b", 2), entrant("c", 9), entrant("d", 0)];
    const draws = [{ winnerUid: "c", voided: true }] as RaffleDraw[];

    expect(eligibleEntrants(entrants, { minCredits: 3 }, draws).map((e) => e.uid)).toEqual(["a"]);
    expect(eligibleEntrants(entrants, { minCredits: 1 }, []).map((e) => e.uid)).toEqual(["a", "b", "c"]);
  });

  it("picks each entrant with a chance proportional to their tickets", () => {
    const eligible = [entrant("a", 1), entrant("b", 3)];

    expect(pickWinner(eligible, () => 0)?.uid).toBe("a");
    expect(pickWinner(eligible, () => 1)?.uid).toBe("b");
    expect(pickWinner(eligible, () => 3)?.uid).toBe("b");
    expect(pickWinner([], () => 0)).toBeNull();
    expect(pickWinner([entrant("z", 0)], () => 0)).toBeNull();
  });

  it("asks the random source for a number below the total tickets", () => {
    const random = vi.fn(() => 0);
    pickWinner([entrant("a", 4), entrant("b", 6)], random);
    expect(random).toHaveBeenCalledWith(10);
  });

  it("builds a reel of other names that ends on the winner", () => {
    const eligible = Array.from({ length: 40 }, (_, i) => entrant(`u${i}`, 1));
    const reel = buildReel(eligible, eligible[7], () => 0);

    expect(reel).toHaveLength(REEL_SIZE);
    expect(reel.at(-1)).toBe("Alias-u7");
    expect(reel.slice(0, -1)).not.toContain("Alias-u7");
    expect(buildReel([eligible[0]], eligible[0], () => 0)).toEqual(["Alias-u0"]);
  });

  it("shuffles the other names fairly: each swap picks among every place left", () => {
    const random = vi.fn(() => 0);
    const eligible = [entrant("a", 1), entrant("b", 1), entrant("c", 1), entrant("w", 1)];

    buildReel(eligible, eligible[3], random);

    expect(random.mock.calls).toEqual([[3], [2]]);
  });
});

describe("drawing", () => {
  let ctx: ReturnType<typeof setup>;
  beforeEach(() => {
    ctx = setup();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("draws a winner among those with tickets, records it, audits it and shows it on the stage", async () => {
    const drawn = await drawRafflePrize(ctx.deps, ADMIN, { prizeId: "polera" });

    // Tickets 10 + 30 + 1 = 41; the last ticket belongs to u4.
    expect(ctx.deps.random).toHaveBeenCalledWith(41);
    expect(drawn).toEqual(
      ok({ id: "polera-1", prizeId: "polera", prizeName: "Polera DevFest", winnerUid: "u4", winnerAlias: "Alias-u4", winnerSquadId: null, tickets: 1, totalTickets: 41, entrants: 3, at: NOW, voided: false }),
    );
    expect(ctx.store.state.prizes.get("polera")).toMatchObject({ awarded: 1, drawSeq: 1 });
    expect(ctx.audits[0]).toMatchObject({ action: "raffle.drawn", actorUid: "a1", targetUid: "polera-1", details: { prize: "Polera DevFest", winner: "u4", tickets: "1/41" } });
    expect(ctx.deps.stage.present).toHaveBeenCalledWith(expect.objectContaining({ id: "polera-1" }), expect.arrayContaining(["Alias-u4"]));
  });

  it("never draws the same cadet twice, and stops when every unit is given", async () => {
    await drawRafflePrize(ctx.deps, ADMIN, { prizeId: "polera" });
    const second = await drawRafflePrize(ctx.deps, ADMIN, { prizeId: "polera" });

    expect(second).toMatchObject({ ok: true, value: { id: "polera-2", winnerUid: "u2", totalTickets: 40, entrants: 2 } });
    expect(await drawRafflePrize(ctx.deps, ADMIN, { prizeId: "polera" })).toEqual(err({ code: "exhausted" }));
  });

  it("voids a draw: the unit is free again and that cadet stays out", async () => {
    await drawRafflePrize(ctx.deps, ADMIN, { prizeId: "polera" });

    expect(await voidRaffleDraw(ctx.deps, ADMIN, { drawId: "polera-1" })).toMatchObject({ ok: true, value: { voided: true } });
    expect(ctx.store.state.prizes.get("polera")).toMatchObject({ awarded: 0, drawSeq: 1 });
    expect(ctx.audits.at(-1)).toMatchObject({ action: "raffle.voided", targetUid: "polera-1" });

    const again = await drawRafflePrize(ctx.deps, ADMIN, { prizeId: "polera" });
    expect(again).toMatchObject({ ok: true, value: { id: "polera-2", winnerUid: "u2" } });
    expect(await voidRaffleDraw(ctx.deps, ADMIN, { drawId: "polera-1" })).toEqual(err({ code: "already-voided" }));
  });

  it("respects the minimum to enter", async () => {
    ctx.store.state.settings = { minCredits: 20 };

    expect(await drawRafflePrize(ctx.deps, ADMIN, { prizeId: "polera" })).toMatchObject({ ok: true, value: { winnerUid: "u2", entrants: 1, totalTickets: 30 } });
  });

  it("refuses an inactive or unknown prize, and a draw without entrants", async () => {
    ctx.store.state.prizes.set("off", { ...PRIZE, id: "off", active: false });
    expect(await drawRafflePrize(ctx.deps, ADMIN, { prizeId: "off" })).toEqual(err({ code: "inactive" }));
    expect(await drawRafflePrize(ctx.deps, ADMIN, { prizeId: "ghost" })).toEqual(err({ code: "not-found" }));

    const empty = setup([entrant("x", 0)]);
    expect(await drawRafflePrize(empty.deps, ADMIN, { prizeId: "polera" })).toEqual(err({ code: "no-entrants" }));
    expect(empty.deps.stage.present).not.toHaveBeenCalled();
  });

  it("keeps the draw when the stage cannot show it, and says so in the log", async () => {
    ctx.deps.stage.present.mockResolvedValue(err({ code: "x" }));

    expect(await drawRafflePrize(ctx.deps, ADMIN, { prizeId: "polera" })).toMatchObject({ ok: true });
    expect(console.error).toHaveBeenCalled();
  });

  it("reports failed reads before drawing", async () => {
    ctx.deps.entrants.list.mockResolvedValueOnce(err({ code: "x" }));
    expect(await drawRafflePrize(ctx.deps, ADMIN, { prizeId: "polera" })).toEqual(err({ code: "unknown" }));
    ctx.store.settings.mockResolvedValueOnce(err({ code: "x" }));
    expect(await drawRafflePrize(ctx.deps, ADMIN, { prizeId: "polera" })).toEqual(err({ code: "unknown" }));
    expect(ctx.store.draw).not.toHaveBeenCalled();
  });
});

describe("prizes and settings", () => {
  let ctx: ReturnType<typeof setup>;
  beforeEach(() => {
    ctx = setup();
  });

  it("creates a prize at the end, trimmed, and audits it", async () => {
    const created = await createRafflePrize(ctx.deps, ADMIN, { name: "  Taza   GDG ", quantity: 3 });

    expect(created).toMatchObject({ ok: true, value: { name: "Taza GDG", quantity: 3, awarded: 0, drawSeq: 0, active: true, order: 1 } });
    expect(ctx.audits[0]).toMatchObject({ action: "raffle.prize.created", details: { name: "Taza GDG", quantity: "3" } });
  });

  it.each([
    [{ name: "x", quantity: 1 }, "invalid-name"],
    [{ name: "Taza", quantity: 0 }, "invalid-quantity"],
    [{ name: "Taza", quantity: 51 }, "invalid-quantity"],
    [{ name: "Taza", quantity: 1.5 }, "invalid-quantity"],
  ])("refuses %j", async (input, code) => {
    expect(await createRafflePrize(ctx.deps, ADMIN, input)).toEqual(err({ code }));
  });

  it("edits, deactivates and reactivates a prize, auditing what changed", async () => {
    expect(await updateRafflePrize(ctx.deps, ADMIN, { id: "polera", name: "Polera XL", quantity: 3 })).toMatchObject({ ok: true, value: { name: "Polera XL", quantity: 3 } });
    expect(await updateRafflePrize(ctx.deps, ADMIN, { id: "polera", active: false })).toMatchObject({ ok: true, value: { active: false } });
    expect(ctx.audits.map((a) => (a as { details: { changed: string } }).details.changed)).toEqual(["name,quantity", "active"]);

    await updateRafflePrize(ctx.deps, ADMIN, { id: "polera", active: false });
    expect(ctx.audits).toHaveLength(2);
  });

  it("gives a prize an uploaded image, replaces it (deleting the old one) and removes it, auditing each change", async () => {
    const first = "public/devfest-2026/raffle-prize/0f8e2c1a-1111-4222-8333-944455550000.webp";
    const second = "public/devfest-2026/raffle-prize/0f8e2c1a-1111-4222-8333-944455551111.webp";

    const created = await createRafflePrize(ctx.deps, ADMIN, { name: "Taza GDG", quantity: 1, imagePath: first });
    expect(created).toMatchObject({ ok: true, value: { image: { path: first, url: `https://cdn/${first}` } } });

    expect(await updateRafflePrize(ctx.deps, ADMIN, { id: "polera", imagePath: first })).toMatchObject({ ok: true, value: { image: { path: first } } });
    expect(await updateRafflePrize(ctx.deps, ADMIN, { id: "polera", imagePath: second })).toMatchObject({ ok: true, value: { image: { path: second } } });
    expect(ctx.deps.images.remove).toHaveBeenCalledWith(first);
    expect(await updateRafflePrize(ctx.deps, ADMIN, { id: "polera", imagePath: null })).toMatchObject({ ok: true, value: { image: null } });
    expect(ctx.deps.images.remove).toHaveBeenLastCalledWith(second);
    expect(ctx.audits.slice(1).map((a) => (a as { details: { changed: string } }).details.changed)).toEqual(["image", "image", "image"]);

    // Leaving the image out keeps it.
    await updateRafflePrize(ctx.deps, ADMIN, { id: "polera", imagePath: second });
    await updateRafflePrize(ctx.deps, ADMIN, { id: "polera", name: "Polera XL" });
    expect(ctx.store.state.prizes.get("polera")?.image?.path).toBe(second);
  });

  it("refuses another kind's image or a foreign address", async () => {
    const badge = "public/devfest-2026/badge/0f8e2c1a-1111-4222-8333-944455550000.webp";

    expect(await createRafflePrize(ctx.deps, ADMIN, { name: "Taza", quantity: 1, imagePath: badge })).toEqual(err({ code: "invalid-image" }));
    expect(await updateRafflePrize(ctx.deps, ADMIN, { id: "polera", imagePath: "https://evil.example/x.webp" })).toEqual(err({ code: "invalid-image" }));
    expect(ctx.store.updatePrize).not.toHaveBeenCalled();
  });

  it("never lowers a prize below the units given, and says which prize is unknown", async () => {
    await drawRafflePrize(ctx.deps, ADMIN, { prizeId: "polera" });
    await drawRafflePrize(ctx.deps, ADMIN, { prizeId: "polera" });

    expect(await updateRafflePrize(ctx.deps, ADMIN, { id: "polera", quantity: 1 })).toEqual(err({ code: "quantity-below-awarded" }));
    expect(await updateRafflePrize(ctx.deps, ADMIN, { id: "ghost", quantity: 1 })).toEqual(err({ code: "not-found" }));
    expect(await updateRafflePrize(ctx.deps, ADMIN, { id: "ghost", name: "Algo" })).toEqual(err({ code: "not-found" }));
    expect(await updateRafflePrize(ctx.deps, ADMIN, { id: "polera", active: "no" })).toEqual(err({ code: "invalid-settings" }));
  });

  it("passes the store's own check of the units given through", async () => {
    ctx.store.updatePrize.mockResolvedValueOnce(err({ code: "quantity-below-awarded" }));

    expect(await updateRafflePrize(ctx.deps, ADMIN, { id: "polera", name: "Polera" })).toEqual(err({ code: "quantity-below-awarded" }));
  });

  it("saves the minimum to enter, audited", async () => {
    expect(await saveRaffleSettings(ctx.deps, ADMIN, { minCredits: 15 })).toEqual(ok({ minCredits: 15 }));
    expect(ctx.audits[0]).toMatchObject({ action: "raffle.settings.updated", details: { minCredits: "15" } });
    expect(await saveRaffleSettings(ctx.deps, ADMIN, { minCredits: 0 })).toEqual(err({ code: "invalid-settings" }));
  });

  it("is only for admins", async () => {
    const staff = { uid: "s1", role: "staff" } as const;
    for (const call of [
      () => getRaffleOverview(ctx.deps, staff),
      () => saveRaffleSettings(ctx.deps, staff, { minCredits: 1 }),
      () => createRafflePrize(ctx.deps, staff, { name: "Taza", quantity: 1 }),
      () => updateRafflePrize(ctx.deps, staff, { id: "polera", active: false }),
      () => drawRafflePrize(ctx.deps, staff, { prizeId: "polera" }),
      () => voidRaffleDraw(ctx.deps, staff, { drawId: "polera-1" }),
    ]) {
      expect(await call()).toEqual(err({ code: "forbidden" }));
    }
    expect(ctx.store.draw).not.toHaveBeenCalled();
  });
});

describe("overview and the cadet's tickets", () => {
  it("answers the settings, the prizes in order, the draws newest first, and who takes part", async () => {
    const ctx = setup();
    ctx.store.state.prizes.set("taza", { ...PRIZE, id: "taza", name: "Taza", order: -1 });
    await drawRafflePrize(ctx.deps, ADMIN, { prizeId: "polera" });

    const overview = await getRaffleOverview(ctx.deps, ADMIN);

    expect(overview).toMatchObject({
      ok: true,
      value: { settings: { minCredits: 1 }, isDefault: true, prizes: [{ id: "taza" }, { id: "polera" }], draws: [{ id: "polera-1" }], eligible: 2, tickets: 40 },
    });
  });

  it("says how many tickets a cadet has, whether they are in, and what they won", async () => {
    const ctx = setup();
    ctx.store.state.settings = { minCredits: 5 };

    expect(await getCadetTickets(ctx.deps, "u9", 3)).toEqual(ok({ tickets: 3, minCredits: 5, eligible: false, won: [] }));
    expect(await getCadetTickets(ctx.deps, "u2", 30)).toEqual(ok({ tickets: 30, minCredits: 5, eligible: true, won: [] }));

    await drawRafflePrize(ctx.deps, ADMIN, { prizeId: "polera" });
    expect(await getCadetTickets(ctx.deps, "u2", 30)).toEqual(ok({ tickets: 30, minCredits: 5, eligible: false, won: ["Polera DevFest"] }));
    await voidRaffleDraw(ctx.deps, ADMIN, { drawId: "polera-1" });
    expect(await getCadetTickets(ctx.deps, "u2", 30)).toEqual(ok({ tickets: 30, minCredits: 5, eligible: false, won: [] }));
  });

  it("reads only the cadet's own draws on their visit", async () => {
    const ctx = setup();

    await getCadetTickets(ctx.deps, "u2", 30);

    expect(ctx.store.drawsOf).toHaveBeenCalledWith("u2");
    expect(ctx.store.draws).not.toHaveBeenCalled();
  });

  it("reports failed reads", async () => {
    const ctx = setup();
    ctx.store.drawsOf.mockResolvedValue(err({ code: "x" }));
    expect(await getCadetTickets(ctx.deps, "u1", 1)).toEqual(err({ code: "unknown" }));
    ctx.store.draws.mockResolvedValue(err({ code: "x" }));
    expect(await getRaffleOverview(ctx.deps, ADMIN)).toEqual(err({ code: "unknown" }));
  });
});
