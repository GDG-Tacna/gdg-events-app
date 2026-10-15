// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { copy } from "@/shared/copy/es";
import { axe } from "@/test-utils/axe";
import type { MoveSquadAction, SeedSquadsAction, SquadAdminActionResult, SquadIdAction, SquadView } from "./admin-actions";
import { SquadsAdminView } from "./SquadsAdminView";

const router = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

const rows = Array.from({ length: 16 }, (_, y) => (y === 0 ? "a..............." : "................"));
const squad = (id: string, order: number, active = true): SquadView => ({
  id,
  name: `Escuadrón ${id}`,
  tagline: "Lema",
  sprite: { rows, palette: { a: "#8b5cf6" } },
  active,
  order,
});
const SQUADS = [squad("angular", 0), squad("cloud", 1, false), squad("gemini", 2)];
const hrefs = { create: "/admin/escuadrones/nuevo", editBase: "/admin/escuadrones", event: "/admin/eventos" };

function setup(props: { squads?: SquadView[]; eventFinished?: boolean; results?: Partial<Record<"seed" | "retire" | "reactivate" | "move", SquadAdminActionResult>> } = {}) {
  const results = props.results ?? {};
  const seed = vi.fn<SeedSquadsAction>(async () => results.seed ?? { ok: true });
  const retire = vi.fn<SquadIdAction>(async () => results.retire ?? { ok: true });
  const reactivate = vi.fn<SquadIdAction>(async () => results.reactivate ?? { ok: true });
  const move = vi.fn<MoveSquadAction>(async () => results.move ?? { ok: true });
  const view = render(
    <SquadsAdminView
      squads={props.squads ?? SQUADS}
      eventFinished={props.eventFinished ?? true}
      seed={seed}
      retire={retire}
      reactivate={reactivate}
      move={move}
      hrefs={hrefs}
    />,
  );
  return { seed, retire, reactivate, move, user: userEvent.setup(), ...view };
}

describe("SquadsAdminView", () => {
  beforeEach(() => vi.clearAllMocks());

  it("lists the squads in order with their state, and links to edit each and to create one", () => {
    setup();

    const items = screen.getAllByRole("listitem");
    expect(items.map((item) => item.textContent?.includes("Escuadrón angular"))).toEqual([true, false, false]);
    expect(items[1]).toHaveTextContent(copy.admin.squads.retired);
    expect(screen.getByRole("link", { name: `${copy.admin.squads.edit}: Escuadrón gemini` })).toHaveAttribute("href", "/admin/escuadrones/gemini");
    expect(screen.getByRole("link", { name: copy.admin.squads.create })).toHaveAttribute("href", "/admin/escuadrones/nuevo");
  });

  it("does not move the first squad further up", async () => {
    const { move, user } = setup();

    screen.getByRole("button", { name: "Mover Escuadrón angular" }).focus();
    await user.keyboard("{ArrowUp}");

    expect(move).not.toHaveBeenCalled();
  });

  it("moves a squad from its handle and refreshes the list", async () => {
    const { move, user } = setup();

    screen.getByRole("button", { name: "Mover Escuadrón gemini" }).focus();
    await user.keyboard("{ArrowUp}");

    expect(move).toHaveBeenCalledWith({ id: "gemini", to: 1 });
    expect(router.refresh).toHaveBeenCalledTimes(1);
  });

  it("keeps Retirar locked while the event is not over, says why and links to the event settings", async () => {
    const { retire, user } = setup({ eventFinished: false });

    const button = screen.getByRole("button", { name: `${copy.admin.squads.retire}: Escuadrón angular` });
    expect(button).toBeDisabled();
    expect(button).toHaveAccessibleDescription(expect.stringContaining(copy.admin.squads.retireLocked));
    expect(screen.getByRole("link", { name: copy.admin.squads.setEnd })).toHaveAttribute("href", "/admin/eventos");
    await user.click(button);
    expect(retire).not.toHaveBeenCalled();
  });

  it("retires a squad once the event is over, and says its members keep it", async () => {
    const { retire, user } = setup();

    await user.click(screen.getByRole("button", { name: `${copy.admin.squads.retire}: Escuadrón angular` }));

    expect(retire).toHaveBeenCalledWith({ id: "angular" });
    expect(await screen.findByText("«Escuadrón angular» ya no se ofrece a cadetes nuevos. Sus miembros lo conservan.", { exact: false })).toHaveAttribute("role", "status");
  });

  it("reactivates a retired squad at any time", async () => {
    const { reactivate, user } = setup({ eventFinished: false });

    await user.click(screen.getByRole("button", { name: `${copy.admin.squads.reactivate}: Escuadrón cloud` }));

    expect(reactivate).toHaveBeenCalledWith({ id: "cloud" });
  });

  it("shows the server's reason when it refuses", async () => {
    const { user } = setup({ results: { retire: { ok: false, code: "event-not-finished" } } });

    await user.click(screen.getByRole("button", { name: `${copy.admin.squads.retire}: Escuadrón angular` }));

    expect(await screen.findByRole("alert")).toHaveTextContent(copy.admin.squads.errors["event-not-finished"]);
    expect(router.refresh).not.toHaveBeenCalled();
  });

  it("offers to load DevFest's squads into an empty edition", async () => {
    const { seed, user } = setup({ squads: [] });

    expect(screen.getByText(copy.admin.squads.empty)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: copy.admin.squads.seed }));

    expect(seed).toHaveBeenCalledTimes(1);
    expect(await screen.findByText(copy.admin.squads.seeded, { exact: false })).toHaveAttribute("role", "status");
  });

  it("has no detectable accessibility violations, locked or not", async () => {
    const { container, unmount } = setup({ eventFinished: false });
    expect((await axe(container)).violations).toEqual([]);
    unmount();

    const open = setup();
    expect((await axe(open.container)).violations).toEqual([]);
  });
});
