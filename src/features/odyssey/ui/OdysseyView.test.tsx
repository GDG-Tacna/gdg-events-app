// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { copy } from "@/shared/copy/es";
import { axe } from "@/test-utils/axe";
import type { OdysseyLog } from "../domain/odyssey";
import { OdysseyView } from "./OdysseyView";

const LOG: OdysseyLog = {
  transmissions: [
    { id: "ai-senal", quadrantId: "ai", title: "Una inteligencia despierta", status: "open", body: "Primera línea.\nSegunda línea." },
    { id: "ai-bitacora", quadrantId: "ai", title: "Bitácora de la inteligencia", status: "locked", unlockMission: "Visita el stand de AI" },
    { id: "old", quadrantId: "retired", title: "Señal perdida", status: "open", body: "Texto viejo de la señal." },
  ],
  open: 2,
  total: 3,
};
const QUADRANTS = [
  { id: "cloud", name: "Google Cloud", planet: "cloud" as const },
  { id: "ai", name: "AI", planet: "ai" as const },
];

describe("OdysseyView", () => {
  it("shows how many transmissions were deciphered, grouped by quadrant", () => {
    render(<OdysseyView log={LOG} quadrants={QUADRANTS} backHref="/missions" />);

    expect(screen.getByRole("heading", { level: 1, name: copy.odyssey.title })).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: copy.odyssey.progressLabel })).toHaveAttribute("aria-valuetext", "2 de 3 transmisiones");
    expect(screen.getAllByRole("heading", { level: 2 }).map((heading) => heading.textContent)).toEqual(["AI", copy.odyssey.otherQuadrant]);
    expect(screen.getByRole("link", { name: copy.odyssey.back })).toHaveAttribute("href", "/missions");
  });

  it("is titled with the edition's story, or the generic name without one", () => {
    const { unmount } = render(<OdysseyView title="La isla del tesoro" log={LOG} quadrants={QUADRANTS} backHref="/missions" />);
    expect(screen.getByRole("heading", { level: 1, name: "La isla del tesoro" })).toBeInTheDocument();
    unmount();

    render(<OdysseyView title={null} log={LOG} quadrants={QUADRANTS} backHref="/missions" />);
    expect(screen.getByRole("heading", { level: 1, name: "Historia" })).toBeInTheDocument();
  });

  it("shows an open transmission's text, and a locked one's title and the mission that deciphers it", () => {
    render(<OdysseyView log={LOG} quadrants={QUADRANTS} backHref="/missions" />);
    const ai = screen.getByRole("region", { name: "AI" });

    const open = within(ai).getByRole("heading", { level: 3, name: "Una inteligencia despierta" }).closest("li")!;
    expect(open).toHaveTextContent(copy.odyssey.open);
    expect(open).toHaveTextContent("Primera línea. Segunda línea.");
    const locked = within(ai).getByRole("heading", { level: 3, name: "Bitácora de la inteligencia" }).closest("li")!;
    expect(locked).toHaveTextContent(copy.odyssey.locked);
    expect(locked).toHaveTextContent("Completa «Visita el stand de AI» para descifrarla.");
  });

  it("says when no transmission has arrived yet", () => {
    render(<OdysseyView log={{ transmissions: [], open: 0, total: 0 }} quadrants={QUADRANTS} backHref="/missions" />);

    expect(screen.getByText(copy.odyssey.empty)).toBeInTheDocument();
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  });

  it("has no detectable accessibility violations", async () => {
    const { container } = render(<OdysseyView log={LOG} quadrants={QUADRANTS} backHref="/missions" />);
    expect((await axe(container)).violations).toEqual([]);
  });
});
