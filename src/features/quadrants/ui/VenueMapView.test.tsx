// @vitest-environment jsdom
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { copy } from "@/shared/copy/es";
import { axe } from "@/test-utils/axe";
import { DEFAULT_QUADRANTS, DEFAULT_VENUE } from "../data/default-layout";
import type { GalaxyMap } from "../domain/galaxy";
import { VenueMapView } from "./VenueMapView";

/** The bundled galaxy, as `getGalaxyMap` builds it, plus one stand whose quadrant is hidden. */
const GALAXY: GalaxyMap = {
  venue: {
    ...DEFAULT_VENUE,
    areas: [...DEFAULT_VENUE.areas, { id: "loose", kind: "stand", label: "Stand libre", quadrantId: null, rect: { x: 4, y: 110, width: 20, height: 6 } }],
  },
  quadrants: DEFAULT_QUADRANTS.map((quadrant) => ({ ...quadrant, stands: DEFAULT_VENUE.areas.filter((area) => area.quadrantId === quadrant.id) })),
};

const plan = () => screen.getByRole("group", { name: copy.map.planLabel });
/** The detail of the chosen stand, below the plan (announced politely). */
const detail = () => within(document.querySelector<HTMLElement>("[aria-live='polite']")!);

describe("VenueMapView", () => {
  it("draws every area of the plan where the data puts it", () => {
    render(<VenueMapView galaxy={GALAXY} />);

    expect(screen.getByRole("heading", { level: 1, name: copy.map.title })).toBeInTheDocument();
    expect(within(plan()).getByText("Auditorio principal")).toHaveStyle({ left: "28%", width: "44%" });
    expect(within(plan()).getByText("Entrada")).toBeInTheDocument();
    // Stands are buttons named by their label and quadrant; the plan keeps the venue's proportions.
    const stand = within(plan()).getByRole("button", { name: "Stand Firebase 1, Zona Firebase" });
    expect(stand).toHaveStyle({ left: "4%", top: "40%" });
    expect(plan().getAttribute("style")).toContain("aspect-ratio: 100 / 140");
    expect(within(plan()).getAllByRole("button")).toHaveLength(11);
  });

  it("draws the venue's real plan under the areas when the edition has one", () => {
    const { container, rerender } = render(<VenueMapView galaxy={GALAXY} />);
    const plan = () => screen.getByRole("group", { name: copy.map.planLabel });
    expect(plan().querySelector("img")).toBeNull();

    rerender(<VenueMapView galaxy={{ ...GALAXY, venue: { ...GALAXY.venue, background: { path: "public/e/venue-plan/x1234567.svg", url: "https://cdn/plan.svg" } } }} />);
    expect(plan().querySelector("img")).toHaveAttribute("src", "https://cdn/plan.svg");
    expect(container.querySelectorAll("img[alt='']")).toHaveLength(1);
  });

  it("shows a stand's quadrant when it is chosen, and hides it when chosen again or closed", () => {
    render(<VenueMapView galaxy={GALAXY} />);
    const stand = within(plan()).getByRole("button", { name: "Stand AI 1, Zona AI" });

    fireEvent.click(stand);
    expect(stand).toHaveAttribute("aria-expanded", "true");
    expect(detail().getByText("Inteligencia para navegar la galaxia")).toBeInTheDocument();

    fireEvent.click(stand);
    expect(stand).toHaveAttribute("aria-expanded", "false");
    expect(detail().queryByText("Inteligencia para navegar la galaxia")).not.toBeInTheDocument();

    fireEvent.click(stand);
    fireEvent.click(screen.getByRole("button", { name: copy.map.close }));
    expect(detail().queryByText("Inteligencia para navegar la galaxia")).not.toBeInTheDocument();
  });

  it("names a stand without an active quadrant as a plain stand", () => {
    render(<VenueMapView galaxy={GALAXY} />);

    const loose = within(plan()).getByRole("button", { name: "Stand libre" });
    expect(loose).toHaveTextContent(copy.map.plainStand);
    fireEvent.click(loose);
    expect(detail().getByText("Stand libre")).toBeInTheDocument();
    expect(detail().queryByText(/^Zona /)).not.toBeInTheDocument();
  });

  it("lists every quadrant with its stands in text, and choosing one there marks it on the plan", () => {
    render(<VenueMapView galaxy={GALAXY} />);

    expect(screen.getAllByRole("heading", { level: 3 }).map((heading) => heading.textContent)).toEqual(DEFAULT_QUADRANTS.map((q) => q.name));
    const stands = screen.getByRole("list", { name: "Stands de Android" });
    fireEvent.click(within(stands).getByRole("button", { name: "Stand Android 2" }));

    expect(within(stands).getByRole("button", { name: "Stand Android 2" })).toHaveAttribute("aria-pressed", "true");
    expect(within(plan()).getByRole("button", { name: "Stand Android 2, Zona Android" })).toHaveAttribute("aria-expanded", "true");
  });

  it("says when a quadrant has no stands yet", () => {
    render(<VenueMapView galaxy={{ ...GALAXY, quadrants: [{ ...GALAXY.quadrants[0], stands: [] }] }} />);

    expect(screen.getByText(copy.map.noStands)).toBeInTheDocument();
  });

  it("has no detectable accessibility violations, with and without a stand chosen", async () => {
    const { container } = render(<VenueMapView galaxy={GALAXY} />);
    expect((await axe(container)).violations).toEqual([]);

    fireEvent.click(within(plan()).getByRole("button", { name: "Stand Google Cloud 1, Zona Google Cloud" }));
    expect((await axe(container)).violations).toEqual([]);
    // Two full axe passes over the SVG plan: more than the default 5 s when the whole suite runs at once.
  }, 15_000);
});
