// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { copy } from "@/shared/copy/es";
import { axe } from "@/test-utils/axe";
import type { SquadPrize } from "../domain/squad-credits";
import { SquadCreditsCard } from "./SquadCreditsCard";

const t = copy.dashboard.squadCredits;
const prize = (id: string, cost: number, stock: number | null, description = ""): SquadPrize => ({ id, name: id.toUpperCase(), description, cost, stock, active: true, order: 0, image: null });

describe("SquadCreditsCard", () => {
  it("shows the squad's balance and how far each prize is", async () => {
    const { container } = render(<SquadCreditsCard balance={120} prizes={[prize("taza", 100, 2, "Una taza"), prize("polera", 120, null), prize("pizza", 300, null)]} />);

    const card = within(screen.getByRole("region", { name: t.label }));
    expect(card.getByText("120")).toBeInTheDocument();
    expect(card.getByText(t.balanceLabel)).toBeInTheDocument();
    const items = card.getAllByRole("listitem");
    expect(items.map((item) => item.textContent)).toEqual([
      `TAZA100 créditosUna taza${t.reachable} · Quedan 2`,
      `POLERA120 créditos${t.reachable}`,
      "PIZZA300 créditosFaltan 180",
    ]);
    expect((await axe(container)).violations).toEqual([]);
  });

  it("says prizes are coming when there are none", () => {
    render(<SquadCreditsCard balance={0} prizes={[]} />);

    expect(screen.getByText(t.noPrizes)).toBeInTheDocument();
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });
});
