import { describe, expect, it, vi } from "vitest";
import { checkCommunication } from "../domain/communication";
import { DEFAULT_COMMUNICATIONS } from "./default-communications";

vi.mock("server-only", () => ({}));
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

  it("give every bundled quadrant an opening transmission, and one that a mission opens", () => {
    // The ids the missions that open them have in an edition are the edition's own (the bundled missions are the ones
    // the 2026 edition had, which no longer match these), so only that each one names a mission is checked here.
    for (const quadrant of DEFAULT_QUADRANTS) {
      const own = DEFAULT_COMMUNICATIONS.filter((c) => c.quadrantId === quadrant.id);
      expect(own.some((c) => c.unlockMissionId === null), quadrant.id).toBe(true);
      expect(own.some((c) => c.unlockMissionId !== null), quadrant.id).toBe(true);
    }
  });
});
