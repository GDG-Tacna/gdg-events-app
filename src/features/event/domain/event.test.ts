import { beforeEach, describe, expect, it, vi } from "vitest";
import { err, ok, type Result } from "@/shared/lib/result";
import { fromEventLocal, hasEventFinished, isFinished, toEventLocal, type EventInfo } from "./event";

const END = new Date("2026-10-24T23:00:00Z"); // 18:00 in Lima

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("event local time (Lima, UTC-5)", () => {
  it("reads what an admin types as Lima time", () => {
    expect(fromEventLocal("2026-10-24T18:00")?.toISOString()).toBe("2026-10-24T23:00:00.000Z");
  });

  it("writes a moment back the way a datetime-local field shows it in Lima", () => {
    expect(toEventLocal(END)).toBe("2026-10-24T18:00");
    expect(toEventLocal(new Date("2026-10-25T03:30:00Z"))).toBe("2026-10-24T22:30");
  });

  it.each(["", "2026-10-24", "2026-10-24 18:00", "24/10/2026 18:00", "2026-02-30T10:00", "2026-13-01T10:00", "2026-10-24T25:00"])(
    "rejects %j",
    (value) => {
      expect(fromEventLocal(value)).toBeNull();
    },
  );
});

describe("isFinished", () => {
  it("is over once the end has passed, and not a moment before", () => {
    const event: EventInfo = { id: "e1", endsAt: END };

    expect(isFinished(event, new Date(END.getTime() - 1))).toBe(false);
    expect(isFinished(event, END)).toBe(true);
    expect(isFinished(event, new Date(END.getTime() + 60_000))).toBe(true);
  });

  it("is never over while no end has been set", () => {
    expect(isFinished({ id: "e1", endsAt: null }, new Date("2099-01-01"))).toBe(false);
  });

  it("is over as soon as an admin marks it finished, whatever its end date", () => {
    expect(isFinished({ id: "e1", endsAt: null, status: "finished" }, new Date("2026-01-01"))).toBe(true);
    expect(isFinished({ id: "e1", endsAt: END, status: "finished" }, new Date("2026-01-01"))).toBe(true);
  });
});

describe("hasEventFinished", () => {
  const deps = (result: Result<EventInfo, { code: string }>) => ({ store: { get: vi.fn(async () => result) }, now: () => new Date("2026-10-25T00:00:00Z") });

  it("answers from the public edition, and reports a failed read", async () => {
    expect(await hasEventFinished(deps(ok({ id: "e1", endsAt: null })))).toEqual(ok(false));
    expect(await hasEventFinished(deps(ok({ id: "e1", endsAt: END })))).toEqual(ok(true));
    expect(await hasEventFinished(deps(err({ code: "unknown" })))).toEqual(err({ code: "unknown" }));
  });
});
