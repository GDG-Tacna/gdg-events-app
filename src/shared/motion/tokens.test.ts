import { describe, expect, it } from "vitest";
import { instant, instantReveal, reveal, screenEnter } from "./tokens";

describe("motion tokens", () => {
  it("every animated token ends fully visible and in place", () => {
    expect(screenEnter.animate).toEqual({ opacity: 1, y: 0 });
    expect(reveal.animate).toEqual({ opacity: 1, scale: 1 });
  });

  it.each([
    ["screenEnter", screenEnter, instant],
    ["reveal", reveal, instantReveal],
  ] as const)("%s has a reduced-motion twin that starts at the final state and takes no time", (_name, normal, reduced) => {
    expect(reduced.initial).toEqual(normal.animate);
    expect(reduced.animate).toEqual(normal.animate);
    expect(reduced.transition.duration).toBe(0);
  });

  it("the normal tokens actually move and take time", () => {
    expect(screenEnter.initial).not.toEqual(screenEnter.animate);
    expect(reveal.initial).not.toEqual(reveal.animate);
    expect(reveal.transition.duration).toBeGreaterThan(0);
  });
});
