// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { copy } from "@/shared/copy/es";
import { axe } from "@/test-utils/axe";
import type { Mission } from "../domain/mission";
import { MissionsAdminView } from "./MissionsAdminView";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

const mission = (id: string, extra: Partial<Mission> = {}): Mission => ({
  id,
  title: `Misión ${id}`,
  description: "",
  quadrantId: "ai",
  xp: 40,
  order: 0,
  active: true,
  credits: null,
  minigame: null,
  minigameDifficulty: null,
  config: { type: "quiz", question: "¿Q?", options: ["a", "b"], answer: 0 },
  ...extra,
});
const MISSIONS = [mission("ai-quiz"), mission("cloud-stand", { quadrantId: "cloud", xp: 30, config: { type: "stand", checkpointId: "stand-cloud-1" } }), mission("old-one", { active: false, quadrantId: "gone" })];
const QUADRANTS = [
  { id: "ai", name: "AI" },
  { id: "cloud", name: "Google Cloud" },
];

function renderView(missions: readonly Mission[] = MISSIONS, overrides: Partial<Parameters<typeof MissionsAdminView>[0]> = {}) {
  const props = {
    missions,
    quadrants: QUADRANTS,
    defaultsCount: 16,
    seed: vi.fn(async () => ({ ok: true as const })),
    setActive: vi.fn(async () => ({ ok: true as const })),
    move: vi.fn(async () => ({ ok: true as const })),
    hrefs: { create: "/admin/misiones/nueva", editBase: "/admin/misiones" },
    ...overrides,
  };
  return { ...render(<MissionsAdminView {...props} />), props };
}

const row = (title: string) => screen.getByText(title).closest("li") as HTMLElement;

describe("MissionsAdminView", () => {
  beforeEach(() => refresh.mockReset());

  it("lists every mission with its type, quadrant, XP, id and state", () => {
    renderView();

    expect(within(row("Misión cloud-stand")).getByText(copy.missions.types.stand)).toBeInTheDocument();
    expect(row("Misión cloud-stand")).toHaveTextContent("Google Cloud");
    expect(row("Misión cloud-stand")).toHaveTextContent("30 XP");
    expect(row("Misión cloud-stand")).toHaveTextContent("cloud-stand");
    expect(row("Misión ai-quiz")).toHaveTextContent(copy.admin.missions.active);
    expect(row("Misión old-one")).toHaveTextContent(copy.admin.missions.inactive);
    expect(row("Misión old-one")).toHaveTextContent(copy.admin.missions.otherQuadrant);
    expect(screen.getByRole("link", { name: `${copy.admin.missions.edit}: Misión ai-quiz` })).toHaveAttribute("href", "/admin/misiones/ai-quiz");
    expect(screen.getByRole("link", { name: copy.admin.missions.create })).toHaveAttribute("href", "/admin/misiones/nueva");
  });

  it("says which missions offer a mini-game", () => {
    renderView([mission("ai-quiz", { minigame: "bug-kong" }), mission("plain"), mission("lost", { minigame: "asteroids" })]);

    expect(row("Misión ai-quiz")).toHaveTextContent("Bonus: Bug Kong");
    expect(row("Misión plain")).not.toHaveTextContent("Bonus");
    expect(row("Misión lost")).not.toHaveTextContent("Bonus");
  });

  it("moves a mission to a new place from its handle and saves it", async () => {
    const { props } = renderView();

    fireEvent.keyDown(screen.getByRole("button", { name: "Mover Misión ai-quiz" }), { key: "End" });

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(props.move).toHaveBeenCalledWith({ id: "ai-quiz", to: MISSIONS.length - 1 });
  });

  it("deactivates an active mission and reactivates an inactive one, saying what happened", async () => {
    const { props } = renderView();

    fireEvent.click(screen.getByRole("button", { name: `${copy.admin.missions.deactivate}: Misión ai-quiz` }));
    expect(await screen.findByText("«Misión ai-quiz» ya no se muestra a los cadetes.", { exact: false })).toHaveAttribute("role", "status");
    expect(props.setActive).toHaveBeenCalledWith({ id: "ai-quiz", active: false });

    fireEvent.click(screen.getByRole("button", { name: `${copy.admin.missions.activate}: Misión old-one` }));
    await waitFor(() => expect(props.setActive).toHaveBeenCalledWith({ id: "old-one", active: true }));
  });

  it("explains a refusal, and an action that throws, without refreshing", async () => {
    renderView(MISSIONS, { setActive: vi.fn(async () => ({ ok: false as const, code: "not-found" as const })), move: vi.fn(async () => { throw new Error("x"); }) });

    fireEvent.click(screen.getByRole("button", { name: `${copy.admin.missions.deactivate}: Misión ai-quiz` }));
    expect(await screen.findByRole("alert")).toHaveTextContent(copy.admin.missions.errors["not-found"]);

    fireEvent.keyDown(screen.getByRole("button", { name: "Mover Misión ai-quiz" }), { key: "ArrowDown" });
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(copy.admin.missions.errors.unknown));
    // The refused move is undone on screen.
    expect(screen.getAllByRole("listitem")[0]).toHaveTextContent("Misión ai-quiz");
    expect(refresh).not.toHaveBeenCalled();
  });

  it("offers to load the bundled missions while the edition has none, warning about creating first", async () => {
    const { props } = renderView([]);

    expect(screen.getByText(/los cadetes ven las 16 misiones por defecto/)).toBeInTheDocument();
    expect(screen.getByText(copy.admin.missions.createWarning)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: copy.admin.missions.seed }));

    expect(await screen.findByText(copy.admin.missions.seeded, { exact: false })).toHaveAttribute("role", "status");
    expect(props.seed).toHaveBeenCalled();
  });

  it("has no detectable accessibility violations, with missions and empty", async () => {
    const { container, unmount } = renderView();
    expect((await axe(container)).violations).toEqual([]);
    unmount();

    const empty = renderView([]);
    expect((await axe(empty.container)).violations).toEqual([]);
  });
});
