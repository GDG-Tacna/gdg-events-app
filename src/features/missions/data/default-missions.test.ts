import { describe, expect, it } from "vitest";
import { MISSION_TYPES, parseMission } from "../domain/mission";
import { DEFAULT_MISSIONS } from "./default-missions";

describe("default missions", () => {
  it("are missions the server would accept, with unique ids and orders", () => {
    for (const mission of DEFAULT_MISSIONS) {
      const { id, ...data } = mission;
      expect(parseMission(id, data), id).toEqual(mission);
    }
    expect(new Set(DEFAULT_MISSIONS.map((m) => m.id)).size).toBe(DEFAULT_MISSIONS.length);
    expect(new Set(DEFAULT_MISSIONS.map((m) => m.order)).size).toBe(DEFAULT_MISSIONS.length);
  });

  it("are the thirteen missions the DevFest 2026 edition had on 2026-11-20, all active and with no mini-game", () => {
    expect(DEFAULT_MISSIONS).toHaveLength(13);
    expect(DEFAULT_MISSIONS.every((m) => m.active && m.minigame === null && m.minigameDifficulty === null)).toBe(true);
    expect(DEFAULT_MISSIONS.map((m) => m.id)).toEqual([
      "community-quiz",
      "louis-3d",
      "construya-su-primer-agente-de-ia-con-gen",
      "charla-agente-de-ia-con-genkit",
      "charla-ai-dibuja-la-pantalla",
      "charla-github-actions-firebase",
      "charla-vibe-coding-al-sdd",
      "charla-jarvis-voz-computer-use",
      "charla-ingeniero-agentico",
      "meet-organizer",
      "meet-speaker",
      "meet-volunteer",
      "meet-squads",
    ]);
  });

  it("cover every type of mission", () => {
    expect(new Set(DEFAULT_MISSIONS.map((m) => m.config.type))).toEqual(new Set(MISSION_TYPES));
  });

  it("include the six talk missions, each tied to the talk it is for and giving its XP", () => {
    const talks = DEFAULT_MISSIONS.filter((m) => m.config.type === "talk");

    expect(talks).toHaveLength(6);
    expect(talks.every((m) => m.quadrantId === "auditorio" && m.xp === 35)).toBe(true);
    expect(new Set(talks.map((m) => (m.config as { checkpointId: string }).checkpointId)).size).toBe(6);
  });

  it("include the four «Conoce a…» missions, which need nothing from the edition's data", () => {
    const meet = DEFAULT_MISSIONS.filter((m) => m.id.startsWith("meet-")).map((m) => [m.id, m.config]);

    expect(meet).toEqual([
      ["meet-organizer", { type: "team", role: "organizer", memberUids: null }],
      ["meet-speaker", { type: "speaker", speakerIds: null }],
      ["meet-volunteer", { type: "team", role: "volunteer", memberUids: null }],
      ["meet-squads", { type: "squads" }],
    ]);
  });

  it("carry no uploaded picture: pictures belong to the edition they were uploaded in", () => {
    expect(DEFAULT_MISSIONS.every((m) => m.image === undefined)).toBe(true);
  });
});
