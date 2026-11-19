// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { actionForKey, isTypingTarget, nextView, slideWindow } from "./console-model";

describe("actionForKey", () => {
  it("maps the keys of the console to what they do", () => {
    expect(actionForKey(" ")).toEqual({ type: "playPause" });
    expect(actionForKey("ArrowRight")).toEqual({ type: "forward" });
    expect(actionForKey("ArrowLeft")).toEqual({ type: "back" });
    expect(actionForKey("Enter")).toEqual({ type: "take" });
    expect(actionForKey("Escape")).toEqual({ type: "stop" });
    expect(actionForKey("ArrowUp")).toEqual({ type: "pickPrevious" });
    expect(actionForKey("ArrowDown")).toEqual({ type: "pickNext" });
  });

  it("gives F1 to F8 to the eight quick scenes in order, and 1 to 9 to the slides", () => {
    expect(actionForKey("F1")).toEqual({ type: "deck", key: "ranking" });
    expect(actionForKey("F3")).toEqual({ type: "deck", key: "reveal" });
    expect(actionForKey("F8")).toEqual({ type: "deck", key: "view" });
    expect(actionForKey("F9")).toBeNull();
    expect(actionForKey("F12")).toBeNull();
    expect(actionForKey("1")).toEqual({ type: "slide", slide: 1 });
    expect(actionForKey("9")).toEqual({ type: "slide", slide: 9 });
    expect(actionForKey("0")).toBeNull();
    expect(actionForKey("a")).toBeNull();
  });
});

describe("isTypingTarget", () => {
  it("leaves keys alone in a field and in a dialog, and takes them anywhere else", () => {
    const field = document.createElement("input");
    const dialog = document.createElement("div");
    dialog.setAttribute("role", "dialog");
    const insideDialog = document.createElement("button");
    dialog.append(insideDialog);
    document.body.append(field, dialog);

    expect(isTypingTarget(field)).toBe(true);
    expect(isTypingTarget(insideDialog)).toBe(true);
    expect(isTypingTarget(document.body)).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
    field.remove();
    dialog.remove();
  });
});

describe("nextView", () => {
  it("cycles cadets, squads, both", () => {
    expect(nextView("cadets")).toBe("squads");
    expect(nextView("squads")).toBe("both");
    expect(nextView("both")).toBe("cadets");
  });
});

describe("slideWindow", () => {
  it("keeps the current slide inside a window of nine, and never leaves the deck", () => {
    expect(slideWindow(1, 18)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(slideWindow(7, 18)).toEqual([3, 4, 5, 6, 7, 8, 9, 10, 11]);
    expect(slideWindow(18, 18)).toEqual([10, 11, 12, 13, 14, 15, 16, 17, 18]);
    expect(slideWindow(2, 4)).toEqual([1, 2, 3, 4]);
    expect(slideWindow(1, 0)).toEqual([]);
  });
});
