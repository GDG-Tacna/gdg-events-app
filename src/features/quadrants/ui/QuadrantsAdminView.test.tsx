// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { copy } from "@/shared/copy/es";
import { axe } from "@/test-utils/axe";
import type { Quadrant } from "../domain/quadrant";
import { QuadrantsAdminView } from "./QuadrantsAdminView";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

const m = copy.admin.map;
const QUADRANTS: Quadrant[] = [
  { id: "cloud", name: "Google Cloud", tagline: "Nube", planet: "cloud", order: 0, active: true },
  { id: "android", name: "Android", tagline: "Flota", planet: "android", order: 1, active: false },
];

function renderView(quadrants: readonly Quadrant[] = QUADRANTS, overrides: Partial<Parameters<typeof QuadrantsAdminView>[0]> = {}) {
  const props = {
    quadrants,
    defaultsCount: 5,
    seed: vi.fn(async () => ({ ok: true as const, standQrs: ["stand-a", "stand-b"], failedQrs: [] })),
    setActive: vi.fn(async () => ({ ok: true as const })),
    move: vi.fn(async () => ({ ok: true as const })),
    hrefs: { create: "/admin/mapa/cuadrantes/nuevo", editBase: "/admin/mapa/cuadrantes", plan: "/admin/mapa/plano" },
    ...overrides,
  };
  return { ...render(<QuadrantsAdminView {...props} />), props };
}

describe("QuadrantsAdminView", () => {
  beforeEach(() => refresh.mockReset());

  it("lists the quadrants with their state, and links to the plan, create and edit", () => {
    renderView();

    expect(screen.getByText("Google Cloud").closest("li")).toHaveTextContent(m.active);
    expect(screen.getByText("Android").closest("li")).toHaveTextContent(m.inactive);
    expect(screen.getByRole("link", { name: m.editPlan })).toHaveAttribute("href", "/admin/mapa/plano");
    expect(screen.getByRole("link", { name: m.createQuadrant })).toHaveAttribute("href", "/admin/mapa/cuadrantes/nuevo");
    expect(screen.getByRole("link", { name: `${m.edit}: Android` })).toHaveAttribute("href", "/admin/mapa/cuadrantes/android");
  });

  it("moves, deactivates and activates, saying what happened", async () => {
    const { props } = renderView();

    fireEvent.keyDown(screen.getByRole("button", { name: "Mover Google Cloud" }), { key: "ArrowDown" });
    await waitFor(() => expect(props.move).toHaveBeenCalledWith({ id: "cloud", to: 1 }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());

    fireEvent.click(screen.getByRole("button", { name: `${m.deactivate}: Google Cloud` }));
    expect(await screen.findByText("«Google Cloud» ya no se muestra.", { exact: false })).toHaveAttribute("role", "status");
    fireEvent.click(screen.getByRole("button", { name: `${m.activate}: Android` }));
    await waitFor(() => expect(props.setActive).toHaveBeenCalledWith({ id: "android", active: true }));
  });

  it("explains a refusal, and an action that throws, without refreshing", async () => {
    renderView(QUADRANTS, { setActive: vi.fn(async () => ({ ok: false as const, code: "not-found" as const })), move: vi.fn(async () => { throw new Error("x"); }) });

    fireEvent.click(screen.getByRole("button", { name: `${m.deactivate}: Google Cloud` }));
    expect(await screen.findByRole("alert")).toHaveTextContent(m.errors["not-found"]);
    fireEvent.keyDown(screen.getByRole("button", { name: "Mover Google Cloud" }), { key: "ArrowDown" });
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(m.errors.unknown));
    expect(refresh).not.toHaveBeenCalled();
  });

  it("offers to load the bundled quadrants and plan, and says how many stand QR codes were made", async () => {
    const { props } = renderView([]);

    expect(screen.getByText(/ven los 5 cuadrantes y el plano por defecto/)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: m.createQuadrant })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: m.seed }));

    expect(await screen.findByText("QR de stands creados: 2.", { exact: false })).toHaveAttribute("role", "status");
    expect(props.seed).toHaveBeenCalled();
  });

  it("has no detectable accessibility violations", async () => {
    const { container } = renderView();
    expect((await axe(container)).violations).toEqual([]);
  });
});
