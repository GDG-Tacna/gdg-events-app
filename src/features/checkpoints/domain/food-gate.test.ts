import { describe, expect, it, vi } from "vitest";
import { err, ok } from "@/shared/lib/result";
import { FoodGate, NO_FOOD_REQUIREMENTS, checkFoodRequirements, foodShortfall, hasFoodRequirements, parseFoodRequirements, type FoodGateDeps } from "./food-gate";

describe("checkFoodRequirements", () => {
  it.each([
    [{ minLevel: 3, minTalks: 2 }, { minLevel: 3, minTalks: 2, minTicket: null }],
    [{ minLevel: 10, minTalks: 50 }, { minLevel: 10, minTalks: 50, minTicket: null }],
    [{ minLevel: 2, minTalks: 1 }, { minLevel: 2, minTalks: 1, minTicket: null }],
    [{ minTicket: "premium" }, { minLevel: null, minTalks: null, minTicket: "premium" }],
    [{ minTicket: "pro" }, { minLevel: null, minTalks: null, minTicket: "pro" }],
    [{ minLevel: null, minTalks: null }, NO_FOOD_REQUIREMENTS],
    [{}, NO_FOOD_REQUIREMENTS],
    [undefined, NO_FOOD_REQUIREMENTS],
    // Level 1, 0 talks and the general ticket are met by everyone: stored as no condition.
    [{ minLevel: 1, minTalks: 0, minTicket: "general" }, NO_FOOD_REQUIREMENTS],
    [{ minTicket: null }, NO_FOOD_REQUIREMENTS],
  ])("accepts %j as %j", (input, expected) => {
    expect(checkFoodRequirements(input)).toEqual({ ok: true, value: expected });
  });

  it.each([
    [{ minLevel: 0 }, "invalid-level"],
    [{ minLevel: 11 }, "invalid-level"],
    [{ minLevel: 2.5 }, "invalid-level"],
    [{ minLevel: "2" }, "invalid-level"],
    [{ minTalks: -1 }, "invalid-talks"],
    [{ minTalks: 51 }, "invalid-talks"],
    [{ minTalks: 1.5 }, "invalid-talks"],
    [{ minTalks: Number.NaN }, "invalid-talks"],
    [{ minTicket: "vip" }, "invalid-ticket"],
    [{ minTicket: 2 }, "invalid-ticket"],
  ])("refuses %j with %s", (input, code) => {
    expect(checkFoodRequirements(input)).toEqual({ ok: false, code });
  });

  it("reads a broken stored value as no condition", () => {
    expect(parseFoodRequirements({ minLevel: 99, minTalks: 2 })).toEqual(NO_FOOD_REQUIREMENTS);
    expect(parseFoodRequirements({ minLevel: 2 })).toEqual({ minLevel: 2, minTalks: null, minTicket: null });
  });

  it("reads a document from before tickets existed (no minTicket) as any ticket, and a broken minTicket as no condition", () => {
    expect(parseFoodRequirements({ minLevel: 2, minTalks: 1 })).toEqual({ minLevel: 2, minTalks: 1, minTicket: null });
    expect(parseFoodRequirements({ minTicket: "vip" })).toEqual(NO_FOOD_REQUIREMENTS);
    expect(parseFoodRequirements({ minTicket: "premium" })).toEqual({ minLevel: null, minTalks: null, minTicket: "premium" });
  });

  it("knows when a meal has conditions", () => {
    expect(hasFoodRequirements(NO_FOOD_REQUIREMENTS)).toBe(false);
    expect(hasFoodRequirements({ minLevel: 2, minTalks: null, minTicket: null })).toBe(true);
    expect(hasFoodRequirements({ minLevel: null, minTalks: 1, minTicket: null })).toBe(true);
    expect(hasFoodRequirements({ minLevel: null, minTalks: null, minTicket: "premium" })).toBe(true);
  });
});

describe("foodShortfall", () => {
  const LUNCH = { minLevel: 2, minTalks: 3, minTicket: null };
  const general = "general" as const;

  it("says the level to reach and how many talks are still missing", () => {
    expect(foodShortfall(LUNCH, { level: 1, talks: 1, ticket: general })).toEqual({ level: 2, talks: 2, ticket: null });
    expect(foodShortfall(LUNCH, { level: 1, talks: 3, ticket: general })).toEqual({ level: 2, talks: null, ticket: null });
    expect(foodShortfall(LUNCH, { level: 2, talks: 0, ticket: general })).toEqual({ level: null, talks: 3, ticket: null });
  });

  it("lets through whoever meets every condition, exactly or above", () => {
    expect(foodShortfall(LUNCH, { level: 2, talks: 3, ticket: general })).toBeNull();
    expect(foodShortfall(LUNCH, { level: 4, talks: 9, ticket: general })).toBeNull();
    expect(foodShortfall(NO_FOOD_REQUIREMENTS, { level: 1, talks: 0, ticket: general })).toBeNull();
  });

  it("asks for the minimum ticket: only premium for a premium meal, pro or premium for a pro one", () => {
    const premium = { minLevel: null, minTalks: null, minTicket: "premium" as const };
    expect(foodShortfall(premium, { level: 1, talks: 0, ticket: "general" })).toEqual({ level: null, talks: null, ticket: "premium" });
    expect(foodShortfall(premium, { level: 1, talks: 0, ticket: "pro" })).toEqual({ level: null, talks: null, ticket: "premium" });
    expect(foodShortfall(premium, { level: 1, talks: 0, ticket: "premium" })).toBeNull();

    const pro = { minLevel: null, minTalks: null, minTicket: "pro" as const };
    expect(foodShortfall(pro, { level: 1, talks: 0, ticket: "general" })).toEqual({ level: null, talks: null, ticket: "pro" });
    expect(foodShortfall(pro, { level: 1, talks: 0, ticket: "pro" })).toBeNull();
    expect(foodShortfall(pro, { level: 1, talks: 0, ticket: "premium" })).toBeNull();
  });

  it("reports the ticket together with the other conditions", () => {
    expect(foodShortfall({ minLevel: 2, minTalks: 1, minTicket: "premium" }, { level: 1, talks: 0, ticket: "general" })).toEqual({ level: 2, talks: 1, ticket: "premium" });
  });
});

describe("FoodGate", () => {
  const LUNCH = { id: "lunch-1", kind: "catering", name: "Almuerzo", active: true };

  const setup = (
    requirements = ok({ minLevel: 2, minTalks: 1, minTicket: null }) as Awaited<ReturnType<FoodGateDeps["requirements"]>>,
    standing = ok({ level: 2, talks: 1, ticket: "general" }) as Awaited<ReturnType<FoodGateDeps["standing"]>>,
  ) => {
    const deps = { requirements: vi.fn(async () => requirements), standing: vi.fn(async () => standing) };
    return { deps, gate: new FoodGate(deps) };
  };

  it("lets a person who meets the meal's conditions through", async () => {
    const { gate, deps } = setup();

    expect(await gate.check({ uid: "u1", checkpoint: LUNCH })).toEqual(ok({ allowed: true }));
    expect(deps.requirements).toHaveBeenCalledWith("lunch-1");
    expect(deps.standing).toHaveBeenCalledWith("u1");
  });

  it("refuses a person who lacks something, saying what", async () => {
    const { gate } = setup(undefined, ok({ level: 1, talks: 0, ticket: "general" }));

    expect(await gate.check({ uid: "u1", checkpoint: LUNCH })).toEqual(ok({ allowed: false, missing: { level: 2, talks: 1, ticket: null } }));
  });

  it("serves only the premium ticket at a meal that asks for it, whatever the level and the talks", async () => {
    const lunch = ok({ minLevel: null, minTalks: null, minTicket: "premium" as const });

    expect(await setup(lunch, ok({ level: 4, talks: 5, ticket: "general" })).gate.check({ uid: "u1", checkpoint: LUNCH })).toEqual(ok({ allowed: false, missing: { level: null, talks: null, ticket: "premium" } }));
    expect(await setup(lunch, ok({ level: 1, talks: 0, ticket: "premium" })).gate.check({ uid: "u1", checkpoint: LUNCH })).toEqual(ok({ allowed: true }));
  });

  it("serves everyone at a meal without conditions, without reading the person", async () => {
    const { gate, deps } = setup(ok(NO_FOOD_REQUIREMENTS));

    expect(await gate.check({ uid: "u1", checkpoint: LUNCH })).toEqual(ok({ allowed: true }));
    expect(deps.standing).not.toHaveBeenCalled();
  });

  it("never gates a checkpoint that is not a meal", async () => {
    const { gate, deps } = setup();

    expect(await gate.check({ uid: "u1", checkpoint: { ...LUNCH, kind: "talk" } })).toEqual(ok({ allowed: true }));
    expect(deps.requirements).not.toHaveBeenCalled();
  });

  it("reports a failed read instead of letting through or refusing", async () => {
    expect(await setup(err({ code: "unknown" })).gate.check({ uid: "u1", checkpoint: LUNCH })).toEqual(err({ code: "unknown" }));
    expect(await setup(undefined, err({ code: "unknown" })).gate.check({ uid: "u1", checkpoint: LUNCH })).toEqual(err({ code: "unknown" }));
  });
});
