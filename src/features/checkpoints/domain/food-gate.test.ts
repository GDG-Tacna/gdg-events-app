import { describe, expect, it, vi } from "vitest";
import { err, ok } from "@/shared/lib/result";
import { FoodGate, NO_FOOD_REQUIREMENTS, checkFoodRequirements, foodShortfall, hasFoodRequirements, parseFoodRequirements, type FoodGateDeps } from "./food-gate";

describe("checkFoodRequirements", () => {
  it.each([
    [{ minLevel: 3, minTalks: 2 }, { minLevel: 3, minTalks: 2 }],
    [{ minLevel: 10, minTalks: 50 }, { minLevel: 10, minTalks: 50 }],
    [{ minLevel: 2, minTalks: 1 }, { minLevel: 2, minTalks: 1 }],
    [{ minLevel: null, minTalks: null }, NO_FOOD_REQUIREMENTS],
    [{}, NO_FOOD_REQUIREMENTS],
    [undefined, NO_FOOD_REQUIREMENTS],
    // Level 1 and 0 talks are met by everyone: stored as no condition.
    [{ minLevel: 1, minTalks: 0 }, NO_FOOD_REQUIREMENTS],
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
  ])("refuses %j with %s", (input, code) => {
    expect(checkFoodRequirements(input)).toEqual({ ok: false, code });
  });

  it("reads a broken stored value as no condition", () => {
    expect(parseFoodRequirements({ minLevel: 99, minTalks: 2 })).toEqual(NO_FOOD_REQUIREMENTS);
    expect(parseFoodRequirements({ minLevel: 2 })).toEqual({ minLevel: 2, minTalks: null });
  });

  it("knows when a meal has conditions", () => {
    expect(hasFoodRequirements(NO_FOOD_REQUIREMENTS)).toBe(false);
    expect(hasFoodRequirements({ minLevel: 2, minTalks: null })).toBe(true);
    expect(hasFoodRequirements({ minLevel: null, minTalks: 1 })).toBe(true);
  });
});

describe("foodShortfall", () => {
  const LUNCH = { minLevel: 2, minTalks: 3 };

  it("says the level to reach and how many talks are still missing", () => {
    expect(foodShortfall(LUNCH, { level: 1, talks: 1 })).toEqual({ level: 2, talks: 2 });
    expect(foodShortfall(LUNCH, { level: 1, talks: 3 })).toEqual({ level: 2, talks: null });
    expect(foodShortfall(LUNCH, { level: 2, talks: 0 })).toEqual({ level: null, talks: 3 });
  });

  it("lets through whoever meets every condition, exactly or above", () => {
    expect(foodShortfall(LUNCH, { level: 2, talks: 3 })).toBeNull();
    expect(foodShortfall(LUNCH, { level: 4, talks: 9 })).toBeNull();
    expect(foodShortfall(NO_FOOD_REQUIREMENTS, { level: 1, talks: 0 })).toBeNull();
  });
});

describe("FoodGate", () => {
  const LUNCH = { id: "lunch-1", kind: "catering", name: "Almuerzo", active: true };

  const setup = (requirements = ok({ minLevel: 2, minTalks: 1 }) as Awaited<ReturnType<FoodGateDeps["requirements"]>>, standing = ok({ level: 2, talks: 1 }) as Awaited<ReturnType<FoodGateDeps["standing"]>>) => {
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
    const { gate } = setup(undefined, ok({ level: 1, talks: 0 }));

    expect(await gate.check({ uid: "u1", checkpoint: LUNCH })).toEqual(ok({ allowed: false, missing: { level: 2, talks: 1 } }));
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
