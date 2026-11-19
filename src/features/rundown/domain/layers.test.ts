import { describe, expect, it } from "vitest";
import {
  addCounterTime,
  cardWire,
  clampPercent,
  counterWire,
  defaultPlaceOf,
  finishCounter,
  formatCounter,
  INITIAL_COUNTER,
  isRunning,
  moveCounter,
  parseCard,
  parseCards,
  parseDuration,
  pauseCounter,
  PLACES,
  remainingOf,
  resetCounter,
  setCounterDuration,
  setCounterLabel,
  setCounterSize,
  setOnZero,
  showCounter,
  startCounter,
} from "./layers";

const NOW = 1_700_000_000_000;

describe("cards", () => {
  const card = { id: "card-0001", kind: "speaker", title: " Luis Eduardo ", text: " Genkit ", link: "", x: 4.04, y: 90, hideAfter: 10 };

  it("reads a card, trimming its text and rounding its place to a tenth, and fills what is optional", () => {
    expect(parseCard(card)).toEqual({ id: "card-0001", kind: "speaker", title: "Luis Eduardo", text: "Genkit", link: "", x: 4, y: 90, hideAfter: 10 });
    expect(parseCard({ id: "card-0002", kind: "notice", title: "Aviso", x: 98, y: 3 })).toEqual({ id: "card-0002", kind: "notice", title: "Aviso", text: "", link: "", x: 98, y: 3, hideAfter: null });
  });

  it.each([
    ["a bad id", { ...card, id: "x" }],
    ["a kind that is not one", { ...card, kind: "banner" }],
    ["an empty title", { ...card, title: "  " }],
    ["a long title", { ...card, title: "x".repeat(61) }],
    ["a long text", { ...card, text: "x".repeat(161) }],
    ["a long link", { ...card, link: "x".repeat(81) }],
    ["a place off the screen", { ...card, x: 101 }],
    ["a negative place", { ...card, y: -0.1 }],
    ["a place that is not a number", { ...card, x: "left" }],
    ["seconds that are not whole", { ...card, hideAfter: 1.5 }],
    ["seconds past ten minutes", { ...card, hideAfter: 601 }],
    ["zero seconds", { ...card, hideAfter: 0 }],
    ["nothing at all", null],
  ])("refuses %s", (_name, input) => {
    expect(parseCard(input)).toBeNull();
  });

  it("reads up to 20 cards, none repeating an id", () => {
    expect(parseCards([card])).toHaveLength(1);
    expect(parseCards([card, card])).toBeNull();
    expect(parseCards(Array.from({ length: 21 }, (_, index) => ({ ...card, id: `card-${String(index).padStart(4, "0")}` })))).toBeNull();
    expect(parseCards("x")).toBeNull();
  });

  it("gives each kind its usual place, and sends the screen only what it draws", () => {
    expect(defaultPlaceOf("speaker")).toEqual(PLACES.bottomLeft);
    expect(defaultPlaceOf("notice")).toEqual(PLACES.topRight);
    const parsed = parseCard(card)!;
    expect(cardWire(parsed)).toEqual({ id: "card-0001", kind: "speaker", title: "Luis Eduardo", text: "Genkit", link: "", x: 4, y: 90 });
  });

  it("holds a place between 0 and 100", () => {
    expect([clampPercent(-5), clampPercent(50.26), clampPercent(130), clampPercent(Number.NaN)]).toEqual([0, 50.3, 100, 0]);
  });
});

describe("the counter", () => {
  it("runs down in real time, pauses where it is and goes on from there", () => {
    const running = startCounter(INITIAL_COUNTER, NOW);
    expect(isRunning(running)).toBe(true);
    expect(remainingOf(running, NOW + 60_000)).toBe(4 * 60_000);

    const paused = pauseCounter(running, NOW + 60_000);
    expect(isRunning(paused)).toBe(false);
    expect(remainingOf(paused, NOW + 999_999)).toBe(4 * 60_000);

    const again = startCounter(paused, NOW + 120_000);
    expect(remainingOf(again, NOW + 150_000)).toBe(4 * 60_000 - 30_000);
  });

  it("never goes below zero, and starting from zero starts over from the total", () => {
    const running = startCounter(INITIAL_COUNTER, NOW);
    expect(remainingOf(running, NOW + 10 * 60_000)).toBe(0);
    const done = finishCounter(running);
    expect(done).toMatchObject({ remainingMs: 0, endsAt: null });
    expect(remainingOf(startCounter(done, NOW), NOW)).toBe(5 * 60_000);
  });

  it("starting twice or pausing when stopped changes nothing", () => {
    const running = startCounter(INITIAL_COUNTER, NOW);
    expect(startCounter(running, NOW + 5000)).toBe(running);
    expect(pauseCounter(INITIAL_COUNTER, NOW)).toBe(INITIAL_COUNTER);
  });

  it("restarts to the total, stopped", () => {
    const part = pauseCounter(startCounter(INITIAL_COUNTER, NOW), NOW + 90_000);
    expect(resetCounter(part)).toMatchObject({ remainingMs: 5 * 60_000, endsAt: null });
  });

  it("sets the time from a second to six hours, stopped, and refuses anything else", () => {
    expect(setCounterDuration(INITIAL_COUNTER, 90_000)).toMatchObject({ totalMs: 90_000, remainingMs: 90_000, endsAt: null });
    expect(setCounterDuration(startCounter(INITIAL_COUNTER, NOW), 10_000)).toMatchObject({ endsAt: null });
    for (const bad of [0, 999, 6 * 3600_000 + 1, Number.NaN, Number.POSITIVE_INFINITY]) expect(setCounterDuration(INITIAL_COUNTER, bad)).toBe(INITIAL_COUNTER);
  });

  it("adds and takes off time, while it runs or is stopped, between zero and six hours", () => {
    const running = startCounter(INITIAL_COUNTER, NOW);
    expect(remainingOf(addCounterTime(running, NOW + 1000, 60_000), NOW + 1000)).toBe(5 * 60_000 - 1000 + 60_000);
    expect(remainingOf(addCounterTime(INITIAL_COUNTER, NOW, -999_999_999), NOW)).toBe(0);
    expect(addCounterTime(INITIAL_COUNTER, NOW, 60_000).remainingMs).toBe(6 * 60_000);
    expect(remainingOf(addCounterTime(INITIAL_COUNTER, NOW, 99 * 3600_000), NOW)).toBe(6 * 3600_000);
    expect(addCounterTime(INITIAL_COUNTER, NOW, Number.NaN)).toBe(INITIAL_COUNTER);
  });

  it("shows, moves, resizes, labels and sets what happens at zero, refusing what is not a choice", () => {
    expect(showCounter(INITIAL_COUNTER, true).visible).toBe(true);
    expect(showCounter(INITIAL_COUNTER, false)).toBe(INITIAL_COUNTER);
    expect(moveCounter(INITIAL_COUNTER, { x: 130, y: -4 })).toMatchObject({ x: 100, y: 0 });
    expect(moveCounter(INITIAL_COUNTER, PLACES.center)).toMatchObject({ x: 50, y: 50 });
    expect(setCounterSize(INITIAL_COUNTER, "lg").size).toBe("lg");
    expect(setCounterSize(INITIAL_COUNTER, "xl" as never)).toBe(INITIAL_COUNTER);
    expect(setCounterLabel(INITIAL_COUNTER, "x".repeat(60)).label).toHaveLength(40);
    expect(setOnZero(INITIAL_COUNTER, "next").onZero).toBe("next");
    expect(setOnZero(INITIAL_COUNTER, "boom" as never)).toBe(INITIAL_COUNTER);
  });

  it("reads a time as people type it: minutes and seconds, hours too, or just minutes", () => {
    expect(parseDuration("05:00")).toBe(300_000);
    expect(parseDuration("5:30")).toBe(330_000);
    expect(parseDuration("1:02:03")).toBe(3_723_000);
    expect(parseDuration(" 10 ")).toBe(600_000);
    for (const bad of ["", "abc", "5:75", "1:2", "99999", "-3", "5:0"]) expect(parseDuration(bad)).toBeNull();
  });

  it("writes the time rounding up, so it shows 00:01 until it really reaches zero", () => {
    expect([formatCounter(300_000), formatCounter(59_001), formatCounter(1), formatCounter(0), formatCounter(-5), formatCounter(3_723_000)]).toEqual(["05:00", "01:00", "00:01", "00:00", "00:00", "1:02:03"]);
  });

  it("sends the screen the time left, whether it runs and when it was true", () => {
    const running = startCounter({ ...INITIAL_COUNTER, visible: true, size: "lg", label: "Empezamos en" }, NOW);
    expect(counterWire(running, NOW + 30_000)).toEqual({ visible: true, remainingMs: 270_000, running: true, sentAt: NOW + 30_000, x: 98, y: 3, size: "lg", label: "Empezamos en" });
    expect(counterWire(pauseCounter(running, NOW + 30_000), NOW + 60_000)).toMatchObject({ remainingMs: 270_000, running: false });
  });
});
