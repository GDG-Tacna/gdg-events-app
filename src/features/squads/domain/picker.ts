import type { SquadPicker } from "./ports";

/**
 * Uniform random pick among the offered squads. `randomInt(max)` must return an integer in
 * [0, max): the server binds `crypto.randomInt`, tests bind a fixed sequence.
 */
export function createRandomPicker(randomInt: (max: number) => number): SquadPicker {
  return (squadIds) => {
    if (squadIds.length === 0) throw new RangeError("Cannot pick a squad from an empty list");

    const index = randomInt(squadIds.length);
    const squadId = squadIds[index];
    if (squadId === undefined) {
      throw new RangeError(`randomInt returned ${index}, outside 0..${squadIds.length - 1}`);
    }
    return squadId;
  };
}
