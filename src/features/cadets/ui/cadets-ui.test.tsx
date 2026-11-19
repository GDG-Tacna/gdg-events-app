// @vitest-environment jsdom
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { copy } from "@/shared/copy/es";
import { axe } from "@/test-utils/axe";
import { answerConfirm } from "@/test-utils/confirm";
import type { ChangeCadetTicketAction } from "@/features/tickets";
import type { BanCadetAction, CadetDetailData, CadetRow, CadetSpeakerControls, CadetTeamControls, GiveTeamRoleAction, TakeTeamRoleAction, ChangeCadetSquadAction, DeleteCadetAction, RenameCadetAction, UnbanCadetAction } from "./actions";
import { CadetDetailView } from "./CadetDetailView";
import { CadetsListView } from "./CadetsListView";

const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

const t = copy.admin.cadets;
const HREFS = { list: "/admin/cadetes", detailBase: "/admin/cadetes" };

const ROW = (uid: string, alias: string, extra: Partial<CadetRow> = {}): CadetRow => ({ uid, alias, name: "Ana Quispe", email: "ana@example.com", squadName: "Firebase", xp: 1200, credits: 30, attended: true, banned: false, ticket: "general", ...extra });

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

  it("marks the cadets who hold a role in the team, and nobody else", () => {
    renderList({ cadets: [ROW("u1", "Nova", { teamRole: "staff" }), ROW("u2", "Mia", { teamRole: "admin" }), ROW("u3", "Eva", { teamRole: null }), ROW("u4", "Leo")] });

    const items = within(screen.getByRole("list", { name: t.listLabel })).getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("Staff");
    expect(items[1]).toHaveTextContent("Admin");
    expect(items[2]).not.toHaveTextContent(/Staff|Organizador|Admin/);
    expect(items[3]).not.toHaveTextContent(/Staff|Organizador|Admin/);
  });

  it("shows each cadet's ticket as a chip, and links to the page that loads the list of tickets", () => {
    renderList({ cadets: [ROW("u1", "Nova", { ticket: "premium" }), ROW("u2", "Mia", { ticket: "pro" }), ROW("u3", "Eva")], hrefs: { ...HREFS, tickets: "/admin/cadetes/entradas" } });

    const items = within(screen.getByRole("list", { name: t.listLabel })).getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("Entrada Premium");
    expect(items[1]).toHaveTextContent("Entrada Pro");
    expect(items[2]).toHaveTextContent("Entrada General");
    expect(screen.getByRole("link", { name: t.ticketsLink })).toHaveAttribute("href", "/admin/cadetes/entradas");
  });

  it("shows no link to the tickets page when it is not given", () => {
    renderList();

    expect(screen.queryByRole("link", { name: t.ticketsLink })).not.toBeInTheDocument();
  });

  it("shows each cadet's real name and email under the alias, or says they are missing", () => {
    renderList({ cadets: [ROW("u1", "Nova"), ROW("u2", "Mia", { name: null, email: null })] });

    const items = within(screen.getByRole("list", { name: t.listLabel })).getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("Ana Quispe");
    expect(items[0]).toHaveTextContent("ana@example.com");
    expect(items[1]).toHaveTextContent(t.noName);
    expect(items[1]).toHaveTextContent(t.noEmail);
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
    expect(screen.getByText("Ningún cadete coincide con «zz».")).toBeInTheDocument();
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
  ticketSource: "default",
  ticketSetByName: null,
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
    const changeTicket = vi.fn<ChangeCadetTicketAction>(async () => ok);
    const ban = vi.fn<BanCadetAction>(async () => ok);
    const unban = vi.fn<UnbanCadetAction>(async () => ok);
    const remove = vi.fn<DeleteCadetAction>(async () => ({ ok: true, alias: "Nova" }));
    const view = render(
      <CadetDetailView cadet={CADET} squads={SQUADS} rename={rename} changeSquad={changeSquad} changeTicket={changeTicket} ban={ban} unban={unban} remove={remove} canDelete canEdit isSelf={false} listHref="/admin/cadetes" {...extra} />,
    );
    return { ...view, rename, changeSquad, changeTicket, ban, unban, remove, user: userEvent.setup() };
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

  it("sets the ticket by hand, says so and refreshes; the button waits for a change", async () => {
    const { changeTicket, user } = renderDetail();
    const save = screen.getByRole("button", { name: t.saveTicket });
    expect(save).toBeDisabled();
    expect(screen.getByLabelText(t.ticketLabel)).toHaveValue("general");

    await user.selectOptions(screen.getByLabelText(t.ticketLabel), "premium");
    await user.click(save);

    expect(changeTicket).toHaveBeenCalledWith({ uid: "cadet-0001", type: "premium" });
    expect(await screen.findByText(t.ticketDone)).toBeInTheDocument();
    expect(router.refresh).toHaveBeenCalled();
  });

  it("says where the ticket came from: the list, the default, or who set it by hand", () => {
    const { unmount } = renderDetail({ cadet: { ...CADET, ticket: "pro", ticketSource: "list" } });
    expect(screen.getByText(copy.tickets.sources.list)).toBeInTheDocument();
    unmount();

    const byDefault = renderDetail();
    expect(screen.getByText(copy.tickets.sources.default)).toBeInTheDocument();
    byDefault.unmount();

    const byHand = renderDetail({ cadet: { ...CADET, ticket: "premium", ticketSource: "manual", ticketSetByName: "Luis Staff" } });
    expect(screen.getByText("Asignada por Luis Staff")).toBeInTheDocument();
    byHand.unmount();

    renderDetail({ cadet: { ...CADET, ticket: "premium", ticketSource: "manual" } });
    expect(screen.getByText(copy.tickets.sources.manualUnknown)).toBeInTheDocument();
  });

  it("shows why a ticket could not be changed, with the ticket wording", async () => {
    const changeTicket = vi.fn<ChangeCadetTicketAction>(async () => ({ ok: false, code: "not-found" }));
    const { user } = renderDetail({ changeTicket });

    await user.selectOptions(screen.getByLabelText(t.ticketLabel), "pro");
    await user.click(screen.getByRole("button", { name: t.saveTicket }));

    expect(await screen.findByText(copy.tickets.errors["not-found"])).toBeInTheDocument();
  });

  it("does not offer the ticket form to a session that may not edit", () => {
    renderDetail({ canEdit: false });

    expect(screen.queryByLabelText(t.ticketLabel)).not.toBeInTheDocument();
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

describe("the team role on a cadet's page", () => {
  const ok = { ok: true as const };
  const tt = t.team;

  function renderRole(team: Partial<CadetTeamControls> = {}, extra: Partial<Parameters<typeof CadetDetailView>[0]> = {}) {
    const give = vi.fn<GiveTeamRoleAction>(async () => ok);
    const take = vi.fn<TakeTeamRoleAction>(async () => ok);
    const controls: CadetTeamControls = { role: null, assignable: ["staff"], give, take, ...team };
    const view = render(
      <CadetDetailView
        cadet={CADET}
        squads={[]}
        rename={vi.fn<RenameCadetAction>(async () => ok)}
        changeSquad={vi.fn<ChangeCadetSquadAction>(async () => ok)}
        changeTicket={vi.fn<ChangeCadetTicketAction>(async () => ok)}
        ban={vi.fn<BanCadetAction>(async () => ok)}
        unban={vi.fn<UnbanCadetAction>(async () => ok)}
        remove={vi.fn<DeleteCadetAction>(async () => ({ ok: true, alias: "Nova" }))}
        team={controls}
        canDelete={false}
        canEdit
        isSelf={false}
        listHref="/admin/cadetes"
        {...extra}
      />,
    );
    return { ...view, give, take, user: userEvent.setup() };
  }

  beforeEach(() => vi.clearAllMocks());

  it("says the cadet has no role, and gives the role chosen after asking, by the account's email", async () => {
    const { give, user } = renderRole();
    expect(screen.getByText("Rol actual: Ninguno: es solo cadete")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: tt.take })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: tt.give }));
    expect(await screen.findByRole("dialog", { name: "¿Dar el rol de Staff a Nova?" })).toBeInTheDocument();
    await answerConfirm("confirm");

    await waitFor(() => expect(give).toHaveBeenCalledWith({ email: "nova@example.com", role: "staff" }));
    expect(await screen.findByText("Nova ahora es Staff. Debe volver a iniciar sesión para ver el cambio.")).toBeInTheDocument();
    expect(router.refresh).toHaveBeenCalled();
  });

  it("gives nothing when the person backs out of the question", async () => {
    const { give, user } = renderRole();

    await user.click(screen.getByRole("button", { name: tt.give }));
    await answerConfirm("cancel");

    expect(give).not.toHaveBeenCalled();
  });

  it("offers only the roles the viewer may give, and asks for more care before making someone admin", async () => {
    const { give, user } = renderRole({ assignable: ["staff", "organizer", "admin"] });

    expect(within(screen.getByLabelText(tt.roleLabel)).getAllByRole("option").map((option) => option.textContent)).toEqual(["Staff", "Organizador", "Admin"]);
    await user.selectOptions(screen.getByLabelText(tt.roleLabel), "admin");
    await user.click(screen.getByRole("button", { name: tt.give }));
    expect(await screen.findByText(tt.confirmGiveAdmin)).toBeInTheDocument();
    await answerConfirm("confirm");

    await waitFor(() => expect(give).toHaveBeenCalledWith({ email: "nova@example.com", role: "admin" }));
  });

  it("shows the role they hold, leaves it out of what can be given, and takes it away after asking so they play again", async () => {
    const { take, user } = renderRole({ role: "staff", assignable: ["staff", "organizer"] });

    expect(screen.getByText("Rol actual: Staff")).toBeInTheDocument();
    expect(within(screen.getByLabelText(tt.roleLabel)).getAllByRole("option").map((option) => option.textContent)).toEqual(["Organizador"]);

    await user.click(screen.getByRole("button", { name: tt.take }));
    expect(await screen.findByRole("dialog", { name: "¿Quitar el rol a Nova?" })).toBeInTheDocument();
    await answerConfirm("confirm");

    await waitFor(() => expect(take).toHaveBeenCalledWith({ email: "nova@example.com" }));
    expect(await screen.findByText(/Se quitó el rol a Nova: vuelve a jugar como cadete/)).toBeInTheDocument();
  });

  it("does not offer to take a role the viewer may not manage (an organizer on an admin)", () => {
    renderRole({ role: "admin", assignable: ["staff"] });

    expect(screen.getByText("Rol actual: Admin")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: tt.take })).not.toBeInTheDocument();
  });

  it("does not offer to give a role when the only one that could be given is the one they hold", () => {
    renderRole({ role: "staff", assignable: ["staff"] });

    expect(screen.queryByRole("button", { name: tt.give })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: tt.take })).toBeInTheDocument();
  });

  it("shows the Equipo screen's wording for a refusal, and the generic one for a code it does not know", async () => {
    const { user, give } = renderRole();
    give.mockResolvedValueOnce({ ok: false, code: "user-not-found" });
    await user.click(screen.getByRole("button", { name: tt.give }));
    await answerConfirm("confirm");
    expect(await screen.findByText(copy.admin.team.errors["user-not-found"])).toBeInTheDocument();

    give.mockResolvedValueOnce({ ok: false, code: "something-new" });
    await user.click(screen.getByRole("button", { name: tt.give }));
    await answerConfirm("confirm");
    expect(await screen.findByText(copy.admin.team.errors.unknown)).toBeInTheDocument();
    expect(router.refresh).not.toHaveBeenCalled();
  });

  it("says the role cannot be given from here when the account's email could not be read, and never on your own page", () => {
    const first = renderRole({}, { cadet: { ...CADET, account: null } });
    expect(screen.getByText(tt.noEmail)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: tt.give })).not.toBeInTheDocument();
    first.unmount();

    renderRole({ role: "staff" }, { isSelf: true });
    expect(screen.getByText(tt.ownAccount)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: tt.take })).not.toBeInTheDocument();
  });

  it("is not there without the team controls, nor for a page that is only shown", () => {
    const first = renderRole({}, { team: undefined });
    expect(screen.queryByRole("heading", { name: tt.title })).not.toBeInTheDocument();
    first.unmount();

    renderRole({}, { canEdit: false });
    expect(screen.queryByRole("heading", { name: tt.title })).not.toBeInTheDocument();
  });

  it("has no accessibility violations", async () => {
    const { container } = renderRole({ role: "staff", assignable: ["staff", "organizer", "admin"] });
    expect((await axe(container)).violations).toEqual([]);
  });
});

describe("the speaker link on a cadet's page", () => {
  const ok = { ok: true as const };
  const ts = t.speaker;

  function renderSpeaker(speaker: Partial<CadetSpeakerControls> = {}, extra: Partial<Parameters<typeof CadetDetailView>[0]> = {}) {
    const link = vi.fn<CadetSpeakerControls["link"]>(async () => ok);
    const unlink = vi.fn<CadetSpeakerControls["unlink"]>(async () => ok);
    const controls: CadetSpeakerControls = { linked: null, available: [{ id: "ana", name: "Ana Torres" }, { id: "luis", name: "Luis Eduardo" }], link, unlink, ...speaker };
    const view = render(
      <CadetDetailView
        cadet={CADET}
        squads={[]}
        rename={vi.fn<RenameCadetAction>(async () => ok)}
        changeSquad={vi.fn<ChangeCadetSquadAction>(async () => ok)}
        changeTicket={vi.fn<ChangeCadetTicketAction>(async () => ok)}
        ban={vi.fn<BanCadetAction>(async () => ok)}
        unban={vi.fn<UnbanCadetAction>(async () => ok)}
        remove={vi.fn<DeleteCadetAction>(async () => ({ ok: true, alias: "Nova" }))}
        speaker={controls}
        canDelete={false}
        canEdit
        isSelf={false}
        listHref="/admin/cadetes"
        {...extra}
      />,
    );
    return { ...view, link, unlink, user: userEvent.setup() };
  }

  beforeEach(() => vi.clearAllMocks());

  it("says the cadet is no speaker and links the one chosen, after asking, with their account's uid", async () => {
    const { link, user } = renderSpeaker();
    expect(screen.getByText(ts.none)).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText(ts.label), "luis");
    await user.click(screen.getByRole("button", { name: ts.link }));
    expect(await screen.findByRole("dialog", { name: "¿Vincular a Nova con Luis Eduardo?" })).toBeInTheDocument();
    await answerConfirm("confirm");

    await waitFor(() => expect(link).toHaveBeenCalledWith({ speakerId: "luis", uid: "cadet-0001" }));
    expect(await screen.findByText("Nova ahora es Luis Eduardo.")).toBeInTheDocument();
    expect(router.refresh).toHaveBeenCalled();
  });

  it("links nothing when the person backs out of the question", async () => {
    const { link, user } = renderSpeaker();

    await user.click(screen.getByRole("button", { name: ts.link }));
    await answerConfirm("cancel");

    expect(link).not.toHaveBeenCalled();
  });

  it("shows the speaker they are linked to, and unlinks after asking", async () => {
    const { unlink, user } = renderSpeaker({ linked: { id: "ana", name: "Ana Torres", active: true } });

    expect(screen.getByText("Vinculado a Ana Torres")).toBeInTheDocument();
    expect(screen.queryByLabelText(ts.label)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: ts.unlink }));
    expect(await screen.findByRole("dialog", { name: "¿Desvincular a Nova de Ana Torres?" })).toBeInTheDocument();
    await answerConfirm("confirm");

    await waitFor(() => expect(unlink).toHaveBeenCalledWith({ speakerId: "ana" }));
    expect(await screen.findByText("Nova ya no está vinculado a Ana Torres.")).toBeInTheDocument();
  });

  it("says when the speaker they are linked to is switched off", () => {
    renderSpeaker({ linked: { id: "ana", name: "Ana Torres", active: false } });

    expect(screen.getByText("Vinculado a Ana Torres (el speaker está desactivado)")).toBeInTheDocument();
  });

  it("explains there is nobody to link when every active speaker already has an account", () => {
    renderSpeaker({ available: [] });

    expect(screen.getByText(ts.noneAvailable)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: ts.link })).not.toBeInTheDocument();
  });

  it("shows the Speakers screen's wording for a refusal, and the generic one for a code it does not know", async () => {
    const { user, link } = renderSpeaker();
    link.mockResolvedValueOnce({ ok: false, code: "taken" });
    await user.click(screen.getByRole("button", { name: ts.link }));
    await answerConfirm("confirm");
    expect(await screen.findByText(copy.admin.speakers.access.errors.taken)).toBeInTheDocument();

    link.mockResolvedValueOnce({ ok: false, code: "something-new" });
    await user.click(screen.getByRole("button", { name: ts.link }));
    await answerConfirm("confirm");
    expect(await screen.findByText(copy.admin.speakers.access.errors.unknown)).toBeInTheDocument();
    expect(router.refresh).not.toHaveBeenCalled();
  });

  it("is not there without the speaker controls, nor for a page that is only shown", () => {
    const first = renderSpeaker({}, { speaker: undefined });
    expect(screen.queryByRole("heading", { name: ts.title })).not.toBeInTheDocument();
    first.unmount();

    renderSpeaker({}, { canEdit: false });
    expect(screen.queryByRole("heading", { name: ts.title })).not.toBeInTheDocument();
  });

  it("has no accessibility violations", async () => {
    const { container } = renderSpeaker({ linked: { id: "ana", name: "Ana Torres", active: true } });
    expect((await axe(container)).violations).toEqual([]);
  });
});
