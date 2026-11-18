import { describe, expect, it } from "vitest";
import { squadProgressOf } from "./squad-progress";

const SQUADS = [
  { id: "angular", active: true },
  { id: "firebase", active: true },
  { id: "gemini", active: true },
  { id: "retired", active: false },
];

describe("squadProgressOf", () => {
  it("asks for every active squad except the cadet's own", () => {
    expect(squadProgressOf({ ownSquad: "angular", squads: SQUADS, contactSquads: [] })).toEqual({ met: [], required: ["firebase", "gemini"] });
    expect(squadProgressOf({ ownSquad: "gemini", squads: SQUADS, contactSquads: [] }).required).toEqual(["angular", "firebase"]);
  });

  it("never asks for a retired squad, and asks for every active one when the cadet's own squad has been retired", () => {
    expect(squadProgressOf({ ownSquad: "retired", squads: SQUADS, contactSquads: [] }).required).toEqual(["angular", "firebase", "gemini"]);
  });

  it("asks for nothing from a cadet with no squad", () => {
    expect(squadProgressOf({ ownSquad: null, squads: SQUADS, contactSquads: ["firebase"] }).required).toEqual([]);
  });

  it("lists the squads of the contacts once each, ignoring contacts with no squad", () => {
    const progress = squadProgressOf({ ownSquad: "angular", squads: SQUADS, contactSquads: ["firebase", null, "firebase", "angular", "gemini"] });

    expect(progress.met).toEqual(["firebase", "angular", "gemini"]);
  });
});
