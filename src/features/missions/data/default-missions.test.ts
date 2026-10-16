import { describe, expect, it, vi } from "vitest";
import { DEFAULT_XP, MISSION_TYPES, parseMission } from "../domain/mission";
import { DEFAULT_MISSIONS } from "./default-missions";

vi.mock("server-only", () => ({}));
const { DEFAULT_QUADRANTS, DEFAULT_VENUE } = await import("@/features/quadrants/server");

describe("default missions", () => {
  it("are missions the server would accept, with unique ids and orders", () => {
    for (const mission of DEFAULT_MISSIONS) {
      const { id, ...data } = mission;
      expect(parseMission(id, data), id).toEqual(mission);
    }
    expect(new Set(DEFAULT_MISSIONS.map((m) => m.id)).size).toBe(DEFAULT_MISSIONS.length);
    expect(new Set(DEFAULT_MISSIONS.map((m) => m.order)).size).toBe(DEFAULT_MISSIONS.length);
  });

  it("cover every type but speaker (it needs the edition's speakers) and every bundled quadrant, with the default XP of their type", () => {
    expect(new Set(DEFAULT_MISSIONS.map((m) => m.config.type))).toEqual(new Set(MISSION_TYPES.filter((type) => type !== "speaker")));
    expect(new Set(DEFAULT_MISSIONS.map((m) => m.quadrantId))).toEqual(new Set(DEFAULT_QUADRANTS.map((q) => q.id)));
    expect(DEFAULT_MISSIONS.every((m) => m.xp === DEFAULT_XP[m.config.type] && m.active && m.minigame === null)).toBe(true);
  });

  it("send stand missions to a stand that exists on the bundled plan", () => {
    const stands = new Set(DEFAULT_VENUE.areas.filter((area) => area.kind === "stand").map((area) => `stand-${area.id}`));
    const standMissions = DEFAULT_MISSIONS.filter((m) => m.config.type === "stand");

    expect(standMissions.length).toBeGreaterThan(0);
    for (const m of standMissions) expect(stands.has((m.config as { checkpointId: string }).checkpointId), m.id).toBe(true);
  });
});
