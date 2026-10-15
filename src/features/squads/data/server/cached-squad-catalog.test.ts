import { describe, expect, it, vi } from "vitest";
import { err, ok } from "@/shared/lib/result";

vi.mock("server-only", () => ({}));

const { CachedSquadCatalog } = await import("./cached-squad-catalog");

const rows = Array.from({ length: 16 }, () => "................");
const SQUAD = { id: "gemini", name: "Escuadrón Gemini", tagline: "Lema", sprite: { rows, palette: {} }, active: true, order: 0 };

function setup() {
  const clock = { now: 0 };
  const store = { list: vi.fn(async () => ok([SQUAD])) };
  const catalog = new CachedSquadCatalog(store, { ttlMs: 60_000, now: () => clock.now });
  return { clock, store, catalog };
}

describe("CachedSquadCatalog", () => {
  it("gives attendees the squads without the admin's ordering field", async () => {
    const { catalog } = setup();

    expect(await catalog.list()).toEqual(ok([{ id: "gemini", name: "Escuadrón Gemini", tagline: "Lema", sprite: SQUAD.sprite, active: true }]));
  });

  it("reads once a minute, not on every page view", async () => {
    const { catalog, store, clock } = setup();

    await catalog.list();
    clock.now = 59_999;
    await catalog.list();
    expect(store.list).toHaveBeenCalledTimes(1);

    clock.now = 60_000;
    await catalog.list();
    expect(store.list).toHaveBeenCalledTimes(2);
  });

  it("reads again right away after an admin change", async () => {
    const { catalog, store } = setup();
    await catalog.list();

    catalog.invalidate();
    await catalog.list();

    expect(store.list).toHaveBeenCalledTimes(2);
  });

  it("never caches a failure", async () => {
    const { catalog, store } = setup();
    store.list.mockResolvedValueOnce(err({ code: "unknown" }) as never);

    expect(await catalog.list()).toEqual(err({ code: "unknown" }));
    expect(await catalog.list()).toMatchObject({ ok: true });
    expect(store.list).toHaveBeenCalledTimes(2);
  });
});
