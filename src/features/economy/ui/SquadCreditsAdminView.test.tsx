// @vitest-environment jsdom
import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { copy } from "@/shared/copy/es";
import { axe } from "@/test-utils/axe";
import type { UploadImageAction } from "@/features/media";
import type { SquadCreditsOverview, SquadPrize } from "../domain/squad-credits";
import {
  SquadCreditsAdminView,
  type AwardSquadBonusAction,
  type RedeemSquadPrizeAction,
  type SaveSquadPrizeAction,
  type SetSquadPrizeActiveAction,
  type SquadCreditsAdminViewProps,
} from "./SquadCreditsAdminView";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

const t = copy.admin.squadCredits;
const f = t.prizeForm;

const UPLOADED = "public/devfest-2026/squad-prize/0f8e2c1a-1111-4222-8333-944455551111.webp";
const POLERA: SquadPrize = { id: "polera", name: "Polera", description: "Una por escuadrón", cost: 100, stock: 3, active: true, order: 0, image: null };
const PIZZA: SquadPrize = { id: "pizza", name: "Pizza", description: "", cost: 300, stock: null, active: true, order: 1, image: null };
const TAZA: SquadPrize = { id: "taza", name: "Taza", description: "", cost: 20, stock: 0, active: true, order: 2, image: null };
const GORRA: SquadPrize = { id: "gorra", name: "Gorra", description: "", cost: 50, stock: 5, active: false, order: 3, image: null };

const OVERVIEW: SquadCreditsOverview = {
  squads: [
    { id: "angular", name: "Escuadrón Angular", active: true, wallet: { squadId: "angular", balance: 150, earned: 200, spent: 50 } },
    { id: "firebase", name: "Escuadrón Firebase", active: true, wallet: { squadId: "firebase", balance: 40, earned: 40, spent: 0 } },
    { id: "cloud", name: "Escuadrón Cloud", active: false, wallet: { squadId: "cloud", balance: 0, earned: 0, spent: 0 } },
  ],
  prizes: [POLERA, PIZZA, TAZA, GORRA],
  redemptions: [{ id: "op-1", squadId: "angular", prizeId: "polera", prizeName: "Polera", cost: 50, actorUid: "a1", at: new Date("2026-10-24T20:30:00Z") }],
};

function setup(overrides: Partial<SquadCreditsAdminViewProps> = {}) {
  let next = 0;
  const props: SquadCreditsAdminViewProps = {
    overview: OVERVIEW,
    squadCreditsEnabled: true,
    awardBonus: vi.fn<AwardSquadBonusAction>(async () => ({ ok: true, value: { added: true, balance: 200 } })),
    redeem: vi.fn<RedeemSquadPrizeAction>(async () => ({ ok: true, value: { redeemed: true, balance: 50 } })),
    createPrize: vi.fn<SaveSquadPrizeAction>(async (input) => ({ ok: true, value: { ...input, active: true, order: 4, image: null } })),
    updatePrize: vi.fn<SaveSquadPrizeAction>(async (input) => ({ ok: true, value: { ...input, active: true, order: 0, image: null } })),
    setPrizeActive: vi.fn<SetSquadPrizeActiveAction>(async ({ id, active }) => ({ ok: true, value: { ...OVERVIEW.prizes.find((prize) => prize.id === id)!, active } })),
    uploadImage: vi.fn<UploadImageAction>(async () => ({ ok: true, image: { path: UPLOADED, url: `https://cdn/${UPLOADED}`, width: 64, height: 64, format: "webp" } })),
    newOperationId: () => `operation-${++next}`,
    ...overrides,
  };
  const view = render(<SquadCreditsAdminView {...props} />);
  return { props, view };
}

const form = (name: string) => within(screen.getByRole("form", { name }));
const region = (name: string) => within(screen.getByRole("region", { name }));
const change = (scope: ReturnType<typeof form>, label: string, value: string) => fireEvent.change(scope.getByLabelText(label), { target: { value } });

describe("SquadCreditsAdminView", () => {
  beforeEach(() => refresh.mockReset());

  it("shows each squad's balance, the prizes with their state, and the latest redemptions", async () => {
    const { view } = setup();

    const balances = within(screen.getByRole("list", { name: t.balancesTitle }));
    expect(balances.getAllByRole("listitem")).toHaveLength(3);
    expect(balances.getByText("150 créditos")).toBeInTheDocument();
    expect(balances.getByText("Ganados 200 · Canjeados 50")).toBeInTheDocument();
    expect(balances.getByText(`· ${t.retired}`, { exact: false })).toBeInTheDocument();

    const prizes = within(screen.getByRole("list", { name: t.prizesLabel }));
    expect(prizes.getByText(/100 créditos · Quedan 3 · Activo/)).toBeInTheDocument();
    expect(prizes.getByText(/300 créditos · Sin límite · Activo/)).toBeInTheDocument();
    expect(prizes.getByText(/20 créditos · Agotado · Activo/)).toBeInTheDocument();
    expect(prizes.getByText(/50 créditos · Quedan 5 · Inactivo/)).toBeInTheDocument();
    expect(prizes.getByText("Una por escuadrón")).toBeInTheDocument();

    const history = within(screen.getByRole("list", { name: t.historyTitle }));
    expect(history.getByText("Escuadrón Angular canjeó «Polera» por 50 créditos")).toBeInTheDocument();
    expect(history.getByText(/24/).closest("time")).toHaveAttribute("dateTime", "2026-10-24T20:30:00.000Z");

    expect(screen.queryByText(t.disabledNote)).not.toBeInTheDocument();
    expect((await axe(view.container)).violations).toEqual([]);
  });

  it("says when members do not feed their squad, and shows empty states", () => {
    setup({ squadCreditsEnabled: false, overview: { squads: [], prizes: [], redemptions: [] } });

    expect(screen.getByText(t.disabledNote)).toBeInTheDocument();
    expect(screen.getByText(t.noSquads)).toBeInTheDocument();
    expect(screen.getByText(t.prizesEmpty)).toBeInTheDocument();
    expect(screen.getByText(t.historyEmpty)).toBeInTheDocument();
    expect(screen.getByText(t.noPrizes)).toBeInTheDocument();
  });

  describe("bonus", () => {
    it("gives a bonus with its reason and a fresh operation id for the next one", async () => {
      const { props } = setup();
      const bonus = region(t.bonusTitle);

      change(bonus, t.squad, "firebase");
      change(bonus, t.amount, "5a0");
      change(bonus, t.reason, "  Reto ganado  ");
      fireEvent.click(bonus.getByRole("button", { name: t.giveBonus }));

      expect(await bonus.findByRole("status")).toHaveTextContent("Bono de 50 créditos para Escuadrón Firebase.");
      expect(props.awardBonus).toHaveBeenCalledWith({ squadId: "firebase", amount: 50, reason: "Reto ganado", operationId: "operation-1" });
      expect(bonus.getByLabelText(t.amount)).toHaveValue("");
      expect(bonus.getByLabelText(t.reason)).toHaveValue("");
      expect(refresh).toHaveBeenCalled();

      change(bonus, t.amount, "10");
      change(bonus, t.reason, "Otro reto");
      fireEvent.click(bonus.getByRole("button", { name: t.giveBonus }));
      await bonus.findByText("Bono de 10 créditos para Escuadrón Firebase.");
      expect(props.awardBonus).toHaveBeenLastCalledWith(expect.objectContaining({ operationId: "operation-3" }));
    });

    it("checks the squad, the amount and the reason before sending", () => {
      const { props } = setup();
      const bonus = region(t.bonusTitle);
      const submit = () => fireEvent.click(bonus.getByRole("button", { name: t.giveBonus }));

      submit();
      expect(bonus.getByRole("alert")).toHaveTextContent(t.chooseSquad);
      change(bonus, t.squad, "angular");
      submit();
      expect(bonus.getByRole("alert")).toHaveTextContent(t.errors["invalid-amount"]);
      change(bonus, t.amount, "100001");
      submit();
      expect(bonus.getByRole("alert")).toHaveTextContent(t.errors["invalid-amount"]);
      change(bonus, t.amount, "100000");
      change(bonus, t.reason, " ab ");
      submit();
      expect(bonus.getByRole("alert")).toHaveTextContent(t.errors["invalid-reason"]);
      expect(props.awardBonus).not.toHaveBeenCalled();
    });

    it("keeps the same operation id after a failure, so a retry is not counted twice", async () => {
      const awardBonus = vi
        .fn<AwardSquadBonusAction>()
        .mockRejectedValueOnce(new Error("offline"))
        .mockResolvedValueOnce({ ok: true, value: { added: false, balance: 200 } });
      setup({ awardBonus });
      const bonus = region(t.bonusTitle);

      change(bonus, t.squad, "angular");
      change(bonus, t.amount, "50");
      change(bonus, t.reason, "Reto");
      fireEvent.click(bonus.getByRole("button", { name: t.giveBonus }));
      expect(await bonus.findByRole("alert")).toHaveTextContent(t.errors.unknown);
      expect(refresh).not.toHaveBeenCalled();

      fireEvent.click(bonus.getByRole("button", { name: t.giveBonus }));
      expect(await bonus.findByRole("status")).toHaveTextContent(t.alreadyDone);
      expect(awardBonus.mock.calls.map(([input]) => input.operationId)).toEqual(["operation-1", "operation-1"]);
    });
  });

  describe("redemption", () => {
    it("offers only active prizes in stock, asks for confirmation with the balance left, and redeems once", async () => {
      const { props } = setup();
      const redeem = region(t.redeemTitle);

      const options = within(redeem.getByLabelText(t.prize)).getAllByRole("option").map((option) => option.textContent);
      expect(options).toEqual([t.choosePrize, "Polera · 100 créditos", "Pizza · 300 créditos"]);
      expect(within(redeem.getByLabelText(t.squad)).getByRole("option", { name: "Escuadrón Cloud (retirado)" })).toBeInTheDocument();

      change(redeem, t.squad, "angular");
      change(redeem, t.prize, "polera");
      fireEvent.click(redeem.getByRole("button", { name: t.redeem }));

      const confirm = within(redeem.getByRole("group", { name: t.confirmRedeem }));
      expect(confirm.getByText("Escuadrón Angular canjea «Polera» por 100 créditos. Le quedarán 50.")).toBeInTheDocument();
      expect(props.redeem).not.toHaveBeenCalled();
      fireEvent.click(confirm.getByRole("button", { name: t.confirmRedeem }));

      expect(await redeem.findByRole("status")).toHaveTextContent("Canje registrado: Escuadrón Angular recibe «Polera».");
      expect(props.redeem).toHaveBeenCalledWith({ squadId: "angular", prizeId: "polera", operationId: "operation-2" });
      expect(redeem.getByLabelText(t.prize)).toHaveValue("");
      expect(refresh).toHaveBeenCalled();

      // A second prize handed out is a new operation.
      change(redeem, t.prize, "polera");
      fireEvent.click(redeem.getByRole("button", { name: t.redeem }));
      fireEvent.click(redeem.getByRole("button", { name: t.confirmRedeem }));
      await vi.waitFor(() => expect(props.redeem).toHaveBeenCalledTimes(2));
      expect(props.redeem).toHaveBeenLastCalledWith({ squadId: "angular", prizeId: "polera", operationId: "operation-3" });
    });

    it("asks for both choices, refuses a squad that cannot afford it, and lets the admin cancel", () => {
      const { props } = setup();
      const redeem = region(t.redeemTitle);
      const ask = () => fireEvent.click(redeem.getByRole("button", { name: t.redeem }));

      ask();
      expect(redeem.getByRole("alert")).toHaveTextContent(t.chooseBoth);
      change(redeem, t.squad, "firebase");
      ask();
      expect(redeem.getByRole("alert")).toHaveTextContent(t.chooseBoth);
      change(redeem, t.prize, "polera");
      ask();
      expect(redeem.getByRole("alert")).toHaveTextContent(t.errors.insufficient);

      change(redeem, t.squad, "angular");
      ask();
      expect(redeem.queryByRole("alert")).not.toBeInTheDocument();
      expect(redeem.getByLabelText(t.squad)).toBeDisabled();
      fireEvent.click(redeem.getByRole("button", { name: t.cancel }));
      expect(redeem.queryByRole("group")).not.toBeInTheDocument();
      expect(redeem.getByLabelText(t.squad)).toBeEnabled();
      expect(props.redeem).not.toHaveBeenCalled();
    });

    it("redeems a squad whose balance is exactly the cost", () => {
      setup({ overview: { ...OVERVIEW, prizes: [{ ...POLERA, cost: 40 }] } });
      const redeem = region(t.redeemTitle);
      change(redeem, t.squad, "firebase");
      change(redeem, t.prize, "polera");
      fireEvent.click(redeem.getByRole("button", { name: t.redeem }));

      expect(redeem.queryByRole("alert")).not.toBeInTheDocument();
      expect(redeem.getByText(/Le quedarán 0\./)).toBeInTheDocument();
    });

    it("explains a refusal from the server and a repeated operation", async () => {
      const redeemAction = vi
        .fn<RedeemSquadPrizeAction>()
        .mockResolvedValueOnce({ ok: false, code: "out-of-stock" })
        .mockResolvedValueOnce({ ok: true, value: { redeemed: false, balance: 50 } });
      setup({ redeem: redeemAction });
      const redeem = region(t.redeemTitle);
      const run = () => {
        fireEvent.click(redeem.getByRole("button", { name: t.redeem }));
        fireEvent.click(redeem.getByRole("button", { name: t.confirmRedeem }));
      };

      change(redeem, t.squad, "angular");
      change(redeem, t.prize, "polera");
      run();
      expect(await redeem.findByRole("alert")).toHaveTextContent(t.errors["out-of-stock"]);
      run();
      expect(await redeem.findByRole("status")).toHaveTextContent(t.alreadyDone);
      expect(redeemAction.mock.calls.map(([input]) => input.operationId)).toEqual(["operation-2", "operation-2"]);
    });
  });

  describe("prizes", () => {
    it("creates a prize with an id suggested from its name", async () => {
      const { props } = setup();
      fireEvent.click(screen.getByRole("button", { name: t.createPrize }));
      const create = form(f.createTitle);

      change(create, f.name, "Pizza del Equipo ñandú");
      expect(create.getByLabelText(f.id)).toHaveValue("pizza-del-equipo-nandu");
      change(create, f.cost, "2.50");
      change(create, f.description, "Para compartir");
      fireEvent.click(create.getByRole("button", { name: f.save }));

      expect(await screen.findByText("Premio «Pizza del Equipo ñandú» creado.")).toBeInTheDocument();
      expect(props.createPrize).toHaveBeenCalledWith({ id: "pizza-del-equipo-nandu", name: "Pizza del Equipo ñandú", description: "Para compartir", cost: 250, stock: null });
      expect(screen.queryByRole("form", { name: f.createTitle })).not.toBeInTheDocument();
      expect(refresh).toHaveBeenCalled();
    });

    it("keeps an id the admin typed, and points each refusal at its field", async () => {
      const createPrize = vi.fn<SaveSquadPrizeAction>(async () => ({ ok: false, code: "already-exists" }));
      setup({ createPrize });
      fireEvent.click(screen.getByRole("button", { name: t.createPrize }));
      const create = form(f.createTitle);
      const save = () => fireEvent.click(create.getByRole("button", { name: f.save }));

      save();
      expect(create.getByLabelText(f.name)).toHaveAccessibleDescription(expect.stringContaining(t.errors["invalid-name"]));
      change(create, f.name, "Polera");
      save();
      expect(create.getByLabelText(f.cost)).toHaveAccessibleDescription(expect.stringContaining(t.errors["invalid-cost"]));
      change(create, f.cost, "100");
      change(create, f.id, "Mi-Polera");
      change(create, f.name, "Polera grande");
      expect(create.getByLabelText(f.id)).toHaveValue("mi-polera");
      change(create, f.stock, "100001");
      save();
      expect(create.getByLabelText(f.stock)).toHaveAccessibleDescription(expect.stringContaining(t.errors["invalid-stock"]));
      change(create, f.stock, "0");
      save();

      expect(await create.findByText(t.errors["already-exists"])).toBeInTheDocument();
      expect(createPrize).toHaveBeenCalledWith({ id: "mi-polera", name: "Polera grande", description: "", cost: 100, stock: 0 });
      expect(create.getByLabelText(f.id)).toHaveAccessibleDescription(expect.stringContaining(t.errors["already-exists"]));
    });

    it("shows a refusal without a field above the form, and a thrown save as unknown", async () => {
      const createPrize = vi.fn<SaveSquadPrizeAction>().mockResolvedValueOnce({ ok: false, code: "forbidden" }).mockRejectedValueOnce(new Error("offline"));
      setup({ createPrize });
      fireEvent.click(screen.getByRole("button", { name: t.createPrize }));
      const create = form(f.createTitle);
      change(create, f.name, "Polera");
      change(create, f.cost, "100");

      fireEvent.click(create.getByRole("button", { name: f.save }));
      expect(await create.findByRole("alert")).toHaveTextContent(t.errors.forbidden);
      fireEvent.click(create.getByRole("button", { name: f.save }));
      expect(await create.findByText(t.errors.unknown)).toBeInTheDocument();
    });

    it("gives a prize a photo and shows it in the list", async () => {
      const { props } = setup({ overview: { ...OVERVIEW, prizes: [{ ...POLERA, image: { path: UPLOADED, url: `https://cdn/${UPLOADED}` } }, PIZZA] } });

      expect(screen.getByText("Polera").closest("li")?.querySelector("img")).toHaveAttribute("src", `https://cdn/${UPLOADED}`);
      expect(screen.getByText("Pizza").closest("li")?.querySelector("img")).toBeNull();

      fireEvent.click(screen.getByRole("button", { name: `${t.edit} Pizza` }));
      fireEvent.change(screen.getByTestId("image-input-squad-prize"), { target: { files: [new File([new Uint8Array(10)], "p.png", { type: "image/png" })] } });
      await vi.waitFor(() => expect(props.uploadImage).toHaveBeenCalled());
      await screen.findByRole("img", { name: `Vista previa: ${f.image}` });
      fireEvent.click(form(f.editTitle).getByRole("button", { name: f.save }));

      await vi.waitFor(() => expect(props.updatePrize).toHaveBeenCalledWith(expect.objectContaining({ id: "pizza", imagePath: UPLOADED })));
    });

    it("edits a prize with its values, the id fixed, and an empty stock as no limit", async () => {
      const { props } = setup();
      fireEvent.click(screen.getByRole("button", { name: `${t.edit} Polera` }));
      const edit = form(f.editTitle);

      expect(edit.queryByLabelText(f.id)).not.toBeInTheDocument();
      expect(edit.getByLabelText(f.name)).toHaveValue("Polera");
      expect(edit.getByLabelText(f.description)).toHaveValue("Una por escuadrón");
      expect(edit.getByLabelText(f.cost)).toHaveValue("100");
      expect(edit.getByLabelText(f.stock)).toHaveValue("3");
      // The form opens in a dialog titled by what it edits.
      expect(screen.getByRole("dialog", { name: f.editTitle })).toHaveTextContent("Polera");

      change(edit, f.stock, "");
      fireEvent.click(edit.getByRole("button", { name: f.save }));

      expect(await screen.findByText("Premio «Polera» guardado.")).toBeInTheDocument();
      expect(props.updatePrize).toHaveBeenCalledWith({ id: "polera", name: "Polera", description: "Una por escuadrón", cost: 100, stock: null });
      expect(props.createPrize).not.toHaveBeenCalled();
    });

    it("opens an unlimited prize with an empty stock, and cancels without saving", () => {
      const { props } = setup();
      fireEvent.click(screen.getByRole("button", { name: `${t.edit} Pizza` }));
      expect(form(f.editTitle).getByLabelText(f.stock)).toHaveValue("");

      fireEvent.click(form(f.editTitle).getByRole("button", { name: f.cancel }));
      expect(screen.queryByRole("form", { name: f.editTitle })).not.toBeInTheDocument();
      expect(props.updatePrize).not.toHaveBeenCalled();
    });

    it("deactivates and activates prizes, and explains a refusal", async () => {
      const setPrizeActive = vi
        .fn<SetSquadPrizeActiveAction>()
        .mockResolvedValueOnce({ ok: true, value: { ...POLERA, active: false } })
        .mockResolvedValueOnce({ ok: true, value: { ...GORRA, active: true } })
        .mockResolvedValueOnce({ ok: false, code: "not-found" });
      setup({ setPrizeActive });

      fireEvent.click(screen.getByRole("button", { name: `${t.deactivate} Polera` }));
      expect(await screen.findByText("«Polera» ya no se puede canjear.")).toBeInTheDocument();
      expect(setPrizeActive).toHaveBeenLastCalledWith({ id: "polera", active: false });

      fireEvent.click(screen.getByRole("button", { name: `${t.activate} Gorra` }));
      expect(await screen.findByText("«Gorra» vuelve a estar disponible.")).toBeInTheDocument();
      expect(setPrizeActive).toHaveBeenLastCalledWith({ id: "gorra", active: true });

      fireEvent.click(screen.getByRole("button", { name: `${t.activate} Gorra` }));
      expect(await screen.findByText(t.errors["not-found"])).toBeInTheDocument();
      expect(refresh).toHaveBeenCalledTimes(2);
    });
  });
});
