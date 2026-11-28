import { beforeEach, describe, expect, it, vi } from "vitest";

vi.unmock("@/app-shell/event-status.server");
vi.mock("server-only", () => ({}));
vi.mock("next/server", () => ({ connection: vi.fn(async () => undefined) }));
vi.mock("@/shared/lib/log", () => ({ logServerError: vi.fn() }));
vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  // Disable per-request memoization in unit tests so each case runs fresh.
  cache: <T extends (...args: never[]) => unknown>(fn: T) => fn,
}));

const NOW = new Date("2026-11-27T15:00:00Z");
const composition = vi.hoisted(() => ({
  publicEventInfo: vi.fn(),
  eventDeps: { now: () => new Date("2026-11-27T15:00:00Z") },
}));
vi.mock("@/app-shell/composition/event.server", () => composition);

const { getPublicEventState, isPublicEventFinished } = await import("./event-status.server");

describe("event-status.server", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    composition.eventDeps.now = () => NOW;
  });

  it("reports finished=false while draft and before endsAt", async () => {
    composition.publicEventInfo.mockResolvedValue({
      ok: true,
      value: { id: "devfest-2026", name: "DevFest Tacna 2026", venue: "UTP", endsAt: new Date("2026-11-28T00:00:00Z"), status: "draft" },
    });

    expect(await getPublicEventState()).toEqual({
      id: "devfest-2026",
      name: "DevFest Tacna 2026",
      venue: "UTP",
      endsAt: new Date("2026-11-28T00:00:00Z"),
      finished: false,
    });
    expect(await isPublicEventFinished()).toBe(false);
  });

  it("reports finished=true when status is finished or when endsAt has passed", async () => {
    composition.publicEventInfo.mockResolvedValue({
      ok: true,
      value: { id: "devfest-2026", name: "DevFest Tacna 2026", venue: null, endsAt: null, status: "finished" },
    });
    expect(await isPublicEventFinished()).toBe(true);

    composition.publicEventInfo.mockResolvedValue({
      ok: true,
      value: { id: "devfest-2026", name: "DevFest Tacna 2026", venue: null, endsAt: new Date("2026-11-27T14:59:00Z"), status: "draft" },
    });
    expect(await isPublicEventFinished()).toBe(true);
  });

  it("fails open (finished=false) when the edition store cannot be read", async () => {
    composition.publicEventInfo.mockResolvedValue({ ok: false, error: { code: "unknown" } });

    expect(await getPublicEventState()).toEqual({ id: "", name: null, venue: null, endsAt: null, finished: false });
  });
});
