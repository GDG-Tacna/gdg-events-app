// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { copy } from "@/shared/copy/es";
import { axe } from "@/test-utils/axe";
import type { TeamMember } from "../domain/team";
import type { ChangeRoleActionResult, GrantRoleAction, RevokeRoleAction } from "./actions";
import { TeamView } from "./TeamView";

const router = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

const t = copy.admin.team;
const ME: TeamMember = { uid: "me", email: "yo@example.com", displayName: "Yo Admin", role: "admin" };
const ANA: TeamMember = { uid: "ana", email: "ana@example.com", displayName: "Ana", role: "staff" };
const JOSE: TeamMember = { uid: "jose", email: "jose@example.com", displayName: "José Pérez", role: "organizer" };
const NO_NAME: TeamMember = { uid: "bruno", email: "bruno@example.com", displayName: null, role: "staff" };

function setup(members: TeamMember[] = [ME, ANA], results: { grant?: ChangeRoleActionResult; revoke?: ChangeRoleActionResult } = {}) {
  const grant = vi.fn<GrantRoleAction>(async () => results.grant ?? { ok: true, member: ANA });
  const revoke = vi.fn<RevokeRoleAction>(async () => results.revoke ?? { ok: true, member: null });
  render(<TeamView members={members} currentUid="me" grant={grant} revoke={revoke} eventId="devfest-2026" />);
  return { grant, revoke, user: userEvent.setup() };
}

const rows = () => within(screen.getByRole("list", { name: t.listLabel })).getAllByRole("listitem");
const emailField = () => screen.getByLabelText(t.emailLabel);
const grantButton = () => screen.getByRole("button", { name: t.grant });
const openGrant = (user: ReturnType<typeof userEvent.setup>) => user.click(screen.getByRole("button", { name: t.grantOpen }));
const trash = (email: string) => screen.getByRole("button", { name: `${t.revoke}: ${email}` });

describe("TeamView list", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows each person with their initial, role and email, marks the viewer, and the edition", () => {
    setup([ME, ANA]);

    expect(rows()).toHaveLength(2);
    expect(rows()[0]).toHaveTextContent("Yo Admin");
    expect(rows()[0]).toHaveTextContent(t.you);
    expect(rows()[0]).toHaveTextContent(t.roles.admin);
    expect(rows()[1]).toHaveTextContent("ana@example.com");
    expect(rows()[1]).toHaveTextContent(t.roles.staff);
    expect(screen.getByText("Se aplica a la edición devfest-2026")).toBeInTheDocument();
  });

  it("falls back to the email when the account has no name", () => {
    setup([NO_NAME]);

    expect(screen.getByText("bruno@example.com")).toBeInTheDocument();
  });

  it("finds people by name or email, ignoring accents and case, and says when nobody matches", async () => {
    const { user } = setup([ME, ANA, JOSE]);
    const search = screen.getByRole("searchbox", { name: t.search });

    await user.type(search, "jose perez");
    expect(rows().map((row) => row.textContent)).toEqual([expect.stringContaining("José Pérez")]);
    expect(screen.getByText("1 de 3 personas")).toBeInTheDocument();

    await user.clear(search);
    await user.type(search, "ANA@");
    expect(rows()).toHaveLength(1);

    await user.clear(search);
    await user.type(search, "zzz");
    expect(screen.getByText("Nadie del equipo coincide con «zzz».")).toBeInTheDocument();
  });

  it("has no trash icon on the viewer's own row: nobody changes their own role", () => {
    setup([ME, ANA]);

    expect(screen.getAllByRole("button", { name: new RegExp(t.revoke) })).toHaveLength(1);
    expect(trash("ana@example.com")).toBeInTheDocument();
  });

  it("says so when the team is empty", () => {
    setup([]);

    expect(screen.getByText(t.empty)).toBeInTheDocument();
  });
});

describe("TeamView revoke", () => {
  beforeEach(() => vi.clearAllMocks());

  it("asks in a dialog before doing anything, and can be cancelled", async () => {
    const { revoke, user } = setup();

    await user.click(trash("ana@example.com"));
    const dialog = screen.getByRole("dialog", { name: t.confirmTitle });
    expect(dialog).toHaveTextContent("¿Quitar el rol a ana@example.com?");

    await user.click(within(dialog).getByRole("button", { name: t.cancel }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(revoke).not.toHaveBeenCalled();
  });

  it("revokes by email once confirmed, says the person must sign in again and refreshes the list", async () => {
    const { revoke, user } = setup();

    await user.click(trash("ana@example.com"));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: t.confirm }));

    expect(revoke).toHaveBeenCalledWith({ email: "ana@example.com" });
    expect(await screen.findByText("Se quitó el rol a ana@example.com. Deberá volver a iniciar sesión.")).toHaveAttribute("role", "status");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(router.refresh).toHaveBeenCalledTimes(1);
  });

  it("shows the server's reason inside the dialog, which stays open", async () => {
    const { user } = setup([ME, ANA], { revoke: { ok: false, code: "last-admin" } });

    await user.click(trash("ana@example.com"));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: t.confirm }));

    expect(await within(screen.getByRole("dialog")).findByRole("alert")).toHaveTextContent(t.errors["last-admin"]);
    expect(router.refresh).not.toHaveBeenCalled();
  });
});

describe("TeamView grant", () => {
  beforeEach(() => vi.clearAllMocks());

  it("opens the form in a dialog, with staff selected and no error", async () => {
    const { user } = setup();

    await openGrant(user);

    expect(screen.getByRole("dialog", { name: t.grantTitle })).toHaveTextContent(t.grantHelp);
    expect(screen.getByRole("radio", { name: new RegExp(t.roles.staff) })).toBeChecked();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("checks the email on the client first and does not call the server with a bad one", async () => {
    const { grant, user } = setup();

    await openGrant(user);
    await user.type(emailField(), "not-an-email");
    await user.click(grantButton());

    expect(emailField()).toHaveAccessibleDescription(expect.stringContaining(t.errors["invalid-email"]));
    expect(grant).not.toHaveBeenCalled();
  });

  it("gives the chosen role, closes the dialog, announces it and refreshes the list", async () => {
    const { grant, user } = setup();

    await openGrant(user);
    await user.type(emailField(), "Nueva@Example.com");
    await user.click(screen.getByRole("radio", { name: new RegExp(t.roles.admin) }));
    await user.click(grantButton());

    expect(grant).toHaveBeenCalledWith({ email: "Nueva@Example.com", role: "admin" });
    expect(await screen.findByText(/ahora es Admin\. Debe volver a iniciar sesión/)).toHaveAttribute("role", "status");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(router.refresh).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["user-not-found", t.errors["user-not-found"]],
    ["cannot-change-self", t.errors["cannot-change-self"]],
    ["unknown", t.errors.unknown],
  ] as const)("shows the %s outcome inside the dialog and keeps what was typed", async (code, message) => {
    const { user } = setup([ME], { grant: { ok: false, code } });

    await openGrant(user);
    await user.type(emailField(), "ghost@example.com");
    await user.click(grantButton());

    expect(await within(screen.getByRole("dialog")).findByRole("alert")).toHaveTextContent(message);
    expect(emailField()).toHaveValue("ghost@example.com");
    expect(router.refresh).not.toHaveBeenCalled();
  });

  it("blocks the form while the change is in flight", async () => {
    let finish!: (value: ChangeRoleActionResult) => void;
    const grant = vi.fn<GrantRoleAction>(() => new Promise((resolve) => (finish = resolve)));
    render(<TeamView members={[ME]} currentUid="me" grant={grant} revoke={vi.fn()} />);
    const user = userEvent.setup();

    await openGrant(user);
    await user.type(emailField(), "ana@example.com");
    await user.click(grantButton());

    expect(screen.getByRole("button", { name: t.granting })).toBeDisabled();
    expect(emailField()).toHaveAttribute("readonly");
    finish({ ok: true, member: ANA });
    expect(await screen.findByRole("status")).toBeInTheDocument();
  });
});

describe("TeamView for an organizer", () => {
  it("offers only the staff role and only staff rows can be removed", async () => {
    render(<TeamView members={[ME, ANA, JOSE]} currentUid="other" grant={vi.fn()} revoke={vi.fn()} assignable={["staff"]} />);
    const user = userEvent.setup();

    expect(trash("ana@example.com")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: `${t.revoke}: jose@example.com` })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: `${t.revoke}: yo@example.com` })).not.toBeInTheDocument();
    await openGrant(user);
    expect(screen.getAllByRole("radio").map((radio) => radio.getAttribute("value"))).toEqual(["staff"]);
  });

  it("shows an admin every role, organizer included", async () => {
    const { user } = setup();

    await openGrant(user);

    expect(screen.getAllByRole("radio").map((radio) => radio.getAttribute("value"))).toEqual(["staff", "organizer", "admin"]);
  });
});

describe("TeamView accessibility", () => {
  it("has no detectable violations, with members and with each dialog open", async () => {
    const user = userEvent.setup();
    const { container } = render(<TeamView members={[ME, ANA]} currentUid="me" grant={vi.fn()} revoke={vi.fn()} eventId="devfest-2026" />);
    expect((await axe(container)).violations).toEqual([]);

    await user.click(trash("ana@example.com"));
    expect((await axe(document.body)).violations).toEqual([]);
    await user.keyboard("{Escape}");

    await openGrant(user);
    expect((await axe(document.body)).violations).toEqual([]);
  });
});
