// @vitest-environment jsdom
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { copy } from "@/shared/copy/es";
import { axe } from "@/test-utils/axe";
import { answerConfirm } from "@/test-utils/confirm";
import type { BanCadetAction, CadetDetailData, CadetRow, ChangeCadetSquadAction, DeleteCadetAction, RenameCadetAction, UnbanCadetAction } from "./actions";
import { CadetDetailView } from "./CadetDetailView";
import { CadetsListView } from "./CadetsListView";

const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

const t = copy.admin.cadets;
const HREFS = { list: "/admin/cadetes", detailBase: "/admin/cadetes" };

const ROW = (uid: string, alias: string, extra: Partial<CadetRow> = {}): CadetRow => ({ uid, alias, squadName: "Firebase", xp: 1200, credits: 30, attended: true, banned: false, ...extra });

describe("CadetsListView", () => {
  const renderList = (props: Partial<Parameters<typeof CadetsListView>[0]> = {}) =>
    render(<CadetsListView cadets={[ROW("u1", "Nova"), ROW("u2", "Mia", { squadName: null, attended: false, banned: true })]} total={42} search="" nextHref={null} hrefs={HREFS} {...props} />);

  it("lists each cadet with their squad, XP and state, and links to their page", () => {
    renderList();

    const items = within(screen.getByRole("list", { name: t.listLabel })).getAllByRole("listitem");
    expect(items[0]).toHaveTextContent(/Firebase · 1[\s.,\u00a0\u202f]?200 XP/);
    expect(items[0]).toHaveTextContent(t.attended);
    expect(items[1]).toHaveTextContent(t.noSquad);
    expect(items[1]).toHaveTextContent(t.notArrived);
    expect(items[1]).toHaveTextContent(t.banned);
    expect(screen.getByRole("link", { name: "Nova" })).toHaveAttribute("href", "/admin/cadetes/u1");
    expect(screen.getByText(/42 en total/)).toBeInTheDocument();
  });

  it("searches with a plain form that keeps the search in the box", () => {
    renderList({ search: "mi" });

    const form = screen.getByRole("search");
    expect(form).toHaveAttribute("action", "/admin/cadetes");
    expect(form).toHaveAttribute("method", "get");
    expect(screen.getByLabelText(t.searchLabel)).toHaveValue("mi");
    expect(screen.getByLabelText(t.searchLabel)).toHaveAttribute("name", "q");
  });

  it("offers the next page only when there is one", () => {
    const { unmount } = renderList({ nextHref: "/admin/cadetes?despues=mia" });
    expect(screen.getByRole("link", { name: t.more })).toHaveAttribute("href", "/admin/cadetes?despues=mia");
    unmount();

    renderList();
    expect(screen.queryByRole("link", { name: t.more })).not.toBeInTheDocument();
  });

  it("says so when the edition has no cadets or the search finds none, and offers to clear the search", () => {
    const { unmount } = renderList({ cadets: [], total: 0 });
    expect(screen.getByText(t.empty)).toBeInTheDocument();
    unmount();

    renderList({ cadets: [], total: 3, search: "zz" });
    expect(screen.getByText("Ningún alias empieza con «zz».")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: t.clear })).toHaveAttribute("href", "/admin/cadetes");
  });

  it("has no detectable accessibility violations", async () => {
    const { container } = renderList();
    expect((await axe(container)).violations).toEqual([]);
  });
});

const CADET: CadetDetailData = {
  ...ROW("cadet-0001", "Nova"),
  squad: "firebase",
  createdAt: "2026-11-01T10:00:00.000Z",
  attendedAt: null,
  activity: { checkIns: 2, missions: 1, badges: 0, contacts: 3 },
  bannedAt: null,
  banReason: null,
  account: { email: "nova@example.com", displayName: "Nova Cadet", disabled: false },
};
const SQUADS = [
  { id: "firebase", name: "Firebase" },
  { id: "angular", name: "Angular" },
];

describe("CadetDetailView", () => {
  const ok = { ok: true as const };
  const renderDetail = (extra: Partial<Parameters<typeof CadetDetailView>[0]> = {}) => {
    const rename = vi.fn<RenameCadetAction>(async () => ok);
    const changeSquad = vi.fn<ChangeCadetSquadAction>(async () => ok);
    const ban = vi.fn<BanCadetAction>(async () => ok);
    const unban = vi.fn<UnbanCadetAction>(async () => ok);
    const remove = vi.fn<DeleteCadetAction>(async () => ({ ok: true, alias: "Nova" }));
    const view = render(
      <CadetDetailView cadet={CADET} squads={SQUADS} rename={rename} changeSquad={changeSquad} ban={ban} unban={unban} remove={remove} canDelete canEdit isSelf={false} listHref="/admin/cadetes" {...extra} />,
    );
    return { ...view, rename, changeSquad, ban, unban, remove, user: userEvent.setup() };
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows who the cadet is and what they did, with the account's email", () => {
    renderDetail();

    expect(screen.getByRole("heading", { level: 1, name: "Nova" })).toBeInTheDocument();
    expect(screen.getByText("nova@example.com")).toBeInTheDocument();
    expect(screen.getByText("Nova Cadet")).toBeInTheDocument();
    expect(screen.getByText("2 asistencias · 1 misiones · 0 insignias · 3 contactos")).toBeInTheDocument();
    expect(screen.getByText(t.notArrived)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: t.back })).toHaveAttribute("href", "/admin/cadetes");
  });

  it("still shows the page when the account could not be read", () => {
    renderDetail({ cadet: { ...CADET, account: null } });

    expect(screen.getAllByText(t.unknown).length).toBeGreaterThan(0);
  });

  it("saves a new alias, says so and refreshes; the button waits for a change", async () => {
    const { rename, user } = renderDetail();
    const save = screen.getByRole("button", { name: t.saveAlias });
    expect(save).toBeDisabled();

    await user.clear(screen.getByLabelText(t.aliasLabel));
    await user.type(screen.getByLabelText(t.aliasLabel), "Estrella");
    await user.click(save);

    expect(rename).toHaveBeenCalledWith({ uid: "cadet-0001", alias: "Estrella" });
    expect(await screen.findByText(t.renamedDone)).toHaveAttribute("role", "status");
    expect(router.refresh).toHaveBeenCalled();
  });

  it("explains a refused alias and does not refresh", async () => {
    const { user } = renderDetail({ rename: vi.fn<RenameCadetAction>(async () => ({ ok: false, code: "alias-taken" })) });

    await user.type(screen.getByLabelText(t.aliasLabel), "x");
    await user.click(screen.getByRole("button", { name: t.saveAlias }));

    expect(await screen.findByRole("alert")).toHaveTextContent(t.errors["alias-taken"]);
    expect(router.refresh).not.toHaveBeenCalled();
  });

  it("changes the squad, or takes the cadet out of theirs", async () => {
    const { changeSquad, user } = renderDetail();

    await user.selectOptions(screen.getByLabelText(t.squadLabel), "angular");
    await user.click(screen.getByRole("button", { name: t.saveSquad }));
    expect(changeSquad).toHaveBeenLastCalledWith({ uid: "cadet-0001", squad: "angular" });

    await user.selectOptions(screen.getByLabelText(t.squadLabel), "");
    await user.click(screen.getByRole("button", { name: t.saveSquad }));
    await waitFor(() => expect(changeSquad).toHaveBeenLastCalledWith({ uid: "cadet-0001", squad: null }));
  });

  it("keeps showing a squad the edition no longer lists", () => {
    renderDetail({ cadet: { ...CADET, squad: "retirado", squadName: "retirado" } });

    expect(screen.getByLabelText(t.squadLabel)).toHaveValue("retirado");
  });

  it("blocks the cadet with a reason after confirming, and refreshes", async () => {
    const { ban, user } = renderDetail();
    const submit = screen.getByRole("button", { name: t.ban });
    expect(submit).toBeDisabled();

    await user.type(screen.getByLabelText(t.reasonLabel), "Cuenta falsa");
    await user.click(submit);

    expect(await screen.findByRole("dialog", { name: "¿Bloquear a Nova?" })).toHaveTextContent(t.confirmBan);
    expect(ban).not.toHaveBeenCalled();
    await answerConfirm("confirm");

    await waitFor(() => expect(ban).toHaveBeenCalled());
    expect(ban).toHaveBeenCalledWith({ uid: "cadet-0001", reason: "Cuenta falsa" });
    expect(await screen.findByText("Nova quedó bloqueado.")).toBeInTheDocument();
    expect(router.refresh).toHaveBeenCalled();
  });

  it("does not block when the confirmation is declined", async () => {
    const { ban, user } = renderDetail();

    await user.type(screen.getByLabelText(t.reasonLabel), "Cuenta falsa");
    await user.click(screen.getByRole("button", { name: t.ban }));
    await answerConfirm("cancel");

    expect(ban).not.toHaveBeenCalled();
  });

  it("shows why a blocked cadet is blocked and lets them in again", async () => {
    const { unban, user } = renderDetail({ cadet: { ...CADET, banned: true, bannedAt: "2026-11-20T10:00:00.000Z", banReason: "Spam" } });

    expect(screen.getByText(/Bloqueado desde/)).toHaveTextContent("Motivo: Spam");
    expect(screen.queryByLabelText(t.reasonLabel)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: t.unban }));

    expect(unban).toHaveBeenCalledWith({ uid: "cadet-0001" });
    expect(await screen.findByText("Nova puede entrar otra vez.")).toBeInTheDocument();
  });

  it("deletes only once the alias is typed, then goes back to the list", async () => {
    const { remove, user } = renderDetail();
    const submit = screen.getByRole("button", { name: t.delete });
    expect(submit).toBeDisabled();

    await user.type(screen.getByLabelText("Para confirmar, escribe su alias: Nova"), "nova");
    expect(submit).toBeDisabled();
    await user.clear(screen.getByLabelText("Para confirmar, escribe su alias: Nova"));
    await user.type(screen.getByLabelText("Para confirmar, escribe su alias: Nova"), "Nova");
    await user.click(submit);

    expect(remove).toHaveBeenCalledWith({ uid: "cadet-0001" });
    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/admin/cadetes"));
  });

  it("explains a refused delete and stays on the page", async () => {
    const { user } = renderDetail({ remove: vi.fn<DeleteCadetAction>(async () => ({ ok: false, code: "forbidden-delete" })) });

    await user.type(screen.getByLabelText("Para confirmar, escribe su alias: Nova"), "Nova");
    await user.click(screen.getByRole("button", { name: t.delete }));

    expect(await screen.findByRole("alert")).toHaveTextContent(t.errors["forbidden-delete"]);
    expect(router.push).not.toHaveBeenCalled();
  });

  it("survives an action that throws", async () => {
    const { user } = renderDetail({ rename: vi.fn<RenameCadetAction>(async () => { throw new Error("offline"); }) });

    await user.type(screen.getByLabelText(t.aliasLabel), "x");
    await user.click(screen.getByRole("button", { name: t.saveAlias }));

    expect(await screen.findByRole("alert")).toHaveTextContent(t.errors.unknown);
  });

  it("offers no delete section unless the session may delete, and no changes without edit access", () => {
    const { unmount } = renderDetail({ canDelete: false });
    expect(screen.queryByRole("button", { name: t.delete })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: t.ban })).toBeInTheDocument();
    unmount();

    renderDetail({ canEdit: false, canDelete: false });
    expect(screen.queryByLabelText(t.aliasLabel)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: t.ban })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "Nova" })).toBeInTheDocument();
  });

  it("does not let an admin block or delete their own cadet", () => {
    renderDetail({ isSelf: true });

    expect(screen.queryByRole("button", { name: t.ban })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: t.delete })).not.toBeInTheDocument();
    expect(screen.getByText(t.errors["own-account"])).toBeInTheDocument();
  });

  it("has no detectable accessibility violations", async () => {
    const { container } = renderDetail();
    expect((await axe(container)).violations).toEqual([]);
  });
});
