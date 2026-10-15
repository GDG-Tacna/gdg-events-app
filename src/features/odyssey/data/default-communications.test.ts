import { describe, expect, it, vi } from "vitest";
import { checkCommunication } from "../domain/communication";
import { DEFAULT_COMMUNICATIONS } from "./default-communications";

vi.mock("server-only", () => ({}));
const { DEFAULT_MISSIONS } = await import("@/features/missions/server");
const { DEFAULT_QUADRANTS } = await import("@/features/quadrants/server");

describe("default communications", () => {
  it("are communications the server would accept, with unique ids and orders", () => {
    for (const communication of DEFAULT_COMMUNICATIONS) {
      const { id, ...data } = communication;
      expect(checkCommunication(id, data), id).toEqual({ ok: true, value: communication });
    }
    expect(new Set(DEFAULT_COMMUNICATIONS.map((c) => c.id)).size).toBe(DEFAULT_COMMUNICATIONS.length);
    expect(new Set(DEFAULT_COMMUNICATIONS.map((c) => c.order)).size).toBe(DEFAULT_COMMUNICATIONS.length);
  });

  it("give every bundled quadrant an opening transmission, and one opened by a bundled mission", () => {
    const missions = new Set(DEFAULT_MISSIONS.map((m) => m.id));
    for (const quadrant of DEFAULT_QUADRANTS) {
      const own = DEFAULT_COMMUNICATIONS.filter((c) => c.quadrantId === quadrant.id);
      expect(own.some((c) => c.unlockMissionId === null), quadrant.id).toBe(true);
      expect(own.some((c) => c.unlockMissionId !== null), quadrant.id).toBe(true);
    }
    for (const c of DEFAULT_COMMUNICATIONS) if (c.unlockMissionId) expect(missions.has(c.unlockMissionId), c.id).toBe(true);
  });
});
