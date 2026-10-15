// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { copy } from "@/shared/copy/es";
import { axe } from "@/test-utils/axe";
import type { RaffleOverview } from "../domain/raffle";
import type { RaffleActions } from "./actions";
import { RaffleAdminView } from "./RaffleAdminView";
import { RaffleTicketsCard } from "./RaffleTicketsCard";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

const t = copy.admin.raffle;
const AT = new Date("2026-10-24T23:50:00Z"); // 18:50 in Lima
const OVERVIEW: RaffleOverview = {
  settings: { minCredits: 1 },
  isDefault: true,
  prizes: [
    { id: "polera", name: "Polera DevFest", quantity: 2, awarded: 1, drawSeq: 1, active: true, order: 0, image: null },
    { id: "taza", name: "Taza GDG", quantity: 1, awarded: 1, drawSeq: 1, active: true, order: 1, image: null },
    { id: "gorra", name: "Gorra", quantity: 3, awarded: 0, drawSeq: 0, active: false, order: 2, image: null },
  ],
  draws: [
    { id: "polera-1", prizeId: "polera", prizeName: "Polera DevFest", winnerUid: "u1", winnerAlias: "Nova_7", winnerSquadId: null, tickets: 12, totalTickets: 480, entrants: 40, at: AT, voided: false },
    { id: "taza-1", prizeId: "taza", prizeName: "Taza GDG", winnerUid: "u2", winnerAlias: "Orion", winnerSquadId: null, tickets: 3, totalTickets: 480, entrants: 40, at: AT, voided: true },
  ],
  eligible: 38,
  tickets: 455,
};

const UPLOADED = "public/devfest-2026/raffle-prize/0f8e2c1a-1111-4222-8333-944455551111.webp";

function actions(): { [K in keyof RaffleActions]: ReturnType<typeof vi.fn> } & RaffleActions {
  return {
    saveSettings: vi.fn(async () => ({ ok: true as const })),
    createPrize: vi.fn(async () => ({ ok: true as const })),
    updatePrize: vi.fn(async () => ({ ok: true as const })),
    draw: vi.fn(async () => ({ ok: true as const, winnerAlias: "Vega", tickets: 7, totalTickets: 455 })),
    voidDraw: vi.fn(async () => ({ ok: true as const })),
    upload: vi.fn(async () => ({ ok: true as const, image: { path: UPLOADED, url: `https://cdn/${UPLOADED}`, width: 64, height: 64, format: "webp" as const } })),
  } as never;
}

const prize = (name: string) => screen.getByRole("heading", { name }).closest("li") as HTMLElement;

describe("RaffleAdminView", () => {
  beforeEach(() => refresh.mockReset());

  it("says who takes part, lists each prize with its units and only offers to draw what is left", () => {
    render(<RaffleAdminView overview={OVERVIEW} actions={actions()} stageHref="/admin/escenario" />);

    expect(screen.getByText("38 cadetes participan con 455 boletos")).toBeInTheDocument();
    expect(prize("Polera DevFest")).toHaveTextContent("Entregados 1 de 2");
    expect(within(prize("Polera DevFest")).getByRole("button", { name: t.draw })).toBeInTheDocument();
    expect(within(prize("Taza GDG")).queryByRole("button", { name: t.draw })).not.toBeInTheDocument();
    expect(prize("Gorra")).toHaveTextContent(t.inactive);
    expect(within(prize("Gorra")).queryByRole("button", { name: t.draw })).not.toBeInTheDocument();
    expect(within(prize("Gorra")).getByRole("button", { name: t.activate })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: t.toStage })).toHaveAttribute("href", "/admin/escenario");
  });

  it("asks before drawing, then says who won and refreshes", async () => {
    const a = actions();
    render(<RaffleAdminView overview={OVERVIEW} actions={a} stageHref="/x" />);

    fireEvent.click(within(prize("Polera DevFest")).getByRole("button", { name: t.draw }));
    expect(screen.getByRole("alert")).toHaveTextContent(t.drawConfirm);
    fireEvent.click(screen.getByRole("button", { name: t.cancel }));
    expect(a.draw).not.toHaveBeenCalled();

    fireEvent.click(within(prize("Polera DevFest")).getByRole("button", { name: t.draw }));
    fireEvent.click(screen.getByRole("button", { name: t.drawYes }));

    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Ganó Vega con 7 de 455 boletos. Ya está en la pantalla grande."));
    expect(a.draw).toHaveBeenCalledWith({ prizeId: "polera" });
    expect(refresh).toHaveBeenCalled();
  });

  it("explains a refused draw", async () => {
    const a = actions();
    a.draw.mockResolvedValue({ ok: false, code: "no-entrants" });
    render(<RaffleAdminView overview={OVERVIEW} actions={a} stageHref="/x" />);

    fireEvent.click(within(prize("Polera DevFest")).getByRole("button", { name: t.draw }));
    fireEvent.click(screen.getByRole("button", { name: t.drawYes }));

    expect(await screen.findByText(t.errors["no-entrants"])).toBeInTheDocument();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("lists the draws with their time, marks a voided one, and voids another after asking", async () => {
    const a = actions();
    render(<RaffleAdminView overview={OVERVIEW} actions={a} stageHref="/x" />);

    const history = screen.getByRole("region", { name: t.historyTitle });
    const items = within(history).getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("Polera DevFest · Nova_7");
    expect(items[0]).toHaveTextContent("18:50");
    expect(items[0]).toHaveTextContent("12 de 480 boletos");
    expect(items[1]).toHaveTextContent(t.voided);
    expect(within(items[1]).queryByRole("button", { name: t.void })).not.toBeInTheDocument();

    fireEvent.click(within(items[0]).getByRole("button", { name: t.void }));
    expect(within(items[0]).getByRole("alert")).toHaveTextContent(t.voidConfirm);
    fireEvent.click(within(items[0]).getByRole("button", { name: t.voidYes }));

    await waitFor(() => expect(a.voidDraw).toHaveBeenCalledWith({ drawId: "polera-1" }));
  });

  it("creates, edits and deactivates prizes", async () => {
    const a = actions();
    render(<RaffleAdminView overview={OVERVIEW} actions={a} stageHref="/x" />);

    fireEvent.click(screen.getByRole("button", { name: t.newPrize }));
    const createDialog = screen.getByRole("dialog", { name: t.newPrize });
    fireEvent.change(within(createDialog).getByLabelText(t.prizeName), { target: { value: "Stickers" } });
    fireEvent.change(within(createDialog).getByLabelText(t.quantity), { target: { value: "1x0" } });
    fireEvent.click(within(createDialog).getByRole("button", { name: t.add }));
    await waitFor(() => expect(a.createPrize).toHaveBeenCalledWith({ name: "Stickers", quantity: 10 }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    fireEvent.click(within(prize("Gorra")).getByRole("button", { name: `${t.edit}: Gorra` }));
    const editDialog = screen.getByRole("dialog", { name: t.edit });
    expect(editDialog).toHaveTextContent("Gorra");
    fireEvent.change(within(editDialog).getByLabelText(t.quantity), { target: { value: "5" } });
    fireEvent.click(within(editDialog).getByRole("button", { name: t.save }));
    await waitFor(() => expect(a.updatePrize).toHaveBeenCalledWith({ id: "gorra", name: "Gorra", quantity: 5 }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    fireEvent.click(within(prize("Polera DevFest")).getByRole("button", { name: t.deactivate }));
    await waitFor(() => expect(a.updatePrize).toHaveBeenCalledWith({ id: "polera", active: false }));
  });

  it("creates a prize with a photo, edits one without touching its photo, and shows it in the list", async () => {
    const a = actions();
    const withPhoto = { ...OVERVIEW, prizes: OVERVIEW.prizes.map((p) => (p.id === "taza" ? { ...p, image: { path: UPLOADED, url: `https://cdn/${UPLOADED}` } } : p)) };
    render(<RaffleAdminView overview={withPhoto} actions={a} stageHref="/x" />);

    // Decorative next to the name: no role of its own.
    expect(prize("Taza GDG").querySelector("img")).toHaveAttribute("src", `https://cdn/${UPLOADED}`);
    expect(prize("Polera DevFest").querySelector("img")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: t.newPrize }));
    const dialog = screen.getByRole("dialog", { name: t.newPrize });
    fireEvent.change(within(dialog).getByLabelText(t.prizeName), { target: { value: "Stickers" } });
    fireEvent.change(screen.getByTestId("image-input-raffle-prize"), { target: { files: [new File([new Uint8Array(10)], "s.png", { type: "image/png" })] } });
    await waitFor(() => expect(a.upload).toHaveBeenCalled());
    await within(dialog).findByRole("img", { name: `Vista previa: ${t.image}` });
    fireEvent.click(within(dialog).getByRole("button", { name: t.add }));
    await waitFor(() => expect(a.createPrize).toHaveBeenCalledWith({ name: "Stickers", quantity: 1, imagePath: UPLOADED }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    fireEvent.click(within(prize("Taza GDG")).getByRole("button", { name: `${t.edit}: Taza GDG` }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: t.save }));
    await waitFor(() => expect(a.updatePrize).toHaveBeenCalledWith({ id: "taza", name: "Taza GDG", quantity: 1 }));
  });

  it("keeps the prize form open when it is refused", async () => {
    const a = actions();
    a.createPrize.mockResolvedValue({ ok: false, code: "invalid-name" });
    render(<RaffleAdminView overview={OVERVIEW} actions={a} stageHref="/x" />);

    fireEvent.click(screen.getByRole("button", { name: t.newPrize }));
    fireEvent.click(screen.getByRole("button", { name: t.add }));

    // The refusal shows inside the dialog, which stays open with the form.
    const dialog = screen.getByRole("dialog", { name: t.newPrize });
    expect(await within(dialog).findByText(t.errors["invalid-name"])).toBeInTheDocument();
    expect(within(dialog).getByLabelText(t.prizeName)).toBeInTheDocument();
  });

  it("saves the minimum to enter, and reports a failure", async () => {
    const a = actions();
    a.saveSettings.mockResolvedValueOnce({ ok: true }).mockRejectedValueOnce(new Error("offline"));
    render(<RaffleAdminView overview={OVERVIEW} actions={a} stageHref="/x" />);

    fireEvent.change(screen.getByLabelText(t.minCredits), { target: { value: "2a0" } });
    fireEvent.click(screen.getByRole("button", { name: t.saveSettings }));
    await waitFor(() => expect(a.saveSettings).toHaveBeenCalledWith({ minCredits: 20 }));

    fireEvent.click(screen.getByRole("button", { name: t.saveSettings }));
    expect(await screen.findByText(t.errors.unknown)).toBeInTheDocument();
  });

  it("says when nobody can take part, and when nothing was drawn yet", () => {
    render(<RaffleAdminView overview={{ ...OVERVIEW, eligible: 0, tickets: 0, prizes: [], draws: [] }} actions={actions()} stageHref="/x" />);

    expect(screen.getByText(t.entrantsNone)).toBeInTheDocument();
    expect(screen.getByText(t.noPrizes)).toBeInTheDocument();
    expect(screen.getByText(t.noDraws)).toBeInTheDocument();
  });

  it("has no detectable accessibility violations", async () => {
    const { container } = render(<RaffleAdminView overview={OVERVIEW} actions={actions()} stageHref="/x" />);

    expect((await axe(container)).violations).toEqual([]);
  });
});

describe("RaffleTicketsCard", () => {
  const c = copy.raffle.card;

  it.each([
    [{ tickets: 45, minCredits: 1, eligible: true, won: [] }, "Tienes 45 boletos", null],
    [{ tickets: 1, minCredits: 1, eligible: true, won: [] }, c.oneTicket, null],
    [{ tickets: 3, minCredits: 10, eligible: false, won: [] }, "Tienes 3 boletos", "Necesitas 10 G-Credits para participar: te faltan 7."],
    [{ tickets: 30, minCredits: 1, eligible: false, won: ["Polera"] }, "Tienes 30 boletos", "¡Ganaste Polera! Acércate a recogerlo."],
    [{ tickets: 30, minCredits: 1, eligible: false, won: [] }, "Tienes 30 boletos", c.drawnOut],
  ])("shows %j", (tickets, count, status) => {
    render(<RaffleTicketsCard tickets={tickets} />);

    const card = screen.getByRole("region", { name: c.title });
    expect(card).toHaveTextContent(count);
    expect(card).toHaveTextContent(c.howItWorks);
    if (status) expect(card).toHaveTextContent(status);
  });

  it("says nothing more to a cadet with exactly the minimum: they are in", () => {
    render(<RaffleTicketsCard tickets={{ tickets: 10, minCredits: 10, eligible: true, won: [] }} />);

    expect(screen.getByRole("region", { name: c.title })).not.toHaveTextContent("Necesitas");
  });
});
