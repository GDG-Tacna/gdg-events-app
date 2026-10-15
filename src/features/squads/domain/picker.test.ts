import { describe, expect, it } from "vitest";
import { createRandomPicker } from "./picker";

const IDS = ["angular", "firebase", "gemini"] as const;

describe("createRandomPicker", () => {
  it("maps each index of the generator to the squad at that position", () => {
    IDS.forEach((id, index) => {
      expect(createRandomPicker(() => index)(IDS)).toBe(id);
    });
  });

  it("asks the generator for a number below the count of squads offered", () => {
    const requested: number[] = [];
    const pick = createRandomPicker((max) => {
      requested.push(max);
      return 0;
    });

    pick(IDS);
    pick(["only", "two"]);

    expect(requested).toEqual([3, 2]);
  });

  it("works with any number of squads, since an admin will add and retire them", () => {
    const many = ["a1", "b2", "c3", "d4", "e5", "f6"];

    expect(createRandomPicker(() => 5)(many)).toBe("f6");
    expect(createRandomPicker(() => 0)(["solo"])).toBe("solo");
  });

  it("fails loudly when the generator returns an index outside the list", () => {
    expect(() => createRandomPicker(() => IDS.length)(IDS)).toThrow(RangeError);
    expect(() => createRandomPicker(() => -1)(IDS)).toThrow(RangeError);
  });

  it("refuses to pick from an empty list", () => {
    expect(() => createRandomPicker(() => 0)([])).toThrow(RangeError);
  });

  it("gives every squad a fair share over many draws", () => {
    const pick = createRandomPicker((max) => Math.floor(Math.random() * max));
    const draws = 6000;
    const counts = new Map<string, number>();

    for (let i = 0; i < draws; i += 1) {
      const id = pick(IDS);
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }

    // Expected 2000 each (sigma about 37): 1700 is far outside random noise, so this only fails on real bias.
    for (const id of IDS) {
      expect(counts.get(id) ?? 0).toBeGreaterThan(1700);
    }
  });
});
