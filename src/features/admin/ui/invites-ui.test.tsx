// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthActionsProvider, type AuthActions } from "@/features/auth";
import { copy } from "@/shared/copy/es";
import { axe } from "@/test-utils/axe";
import type { Invite } from "../domain/invites";
import { InviteAcceptPanel } from "./InviteAcceptPanel";
import type { AcceptInviteAction, CreateInviteAction, RevokeInviteAction } from "./invite-actions";
import { InvitesPanel } from "./InvitesPanel";

const router = vi.hoisted(() => ({ refresh: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

const t = copy.admin.team.invites;
const i = copy.invite;
const NOW = new Date("2026-10-20T12:00:00Z");
const invite = (id: string, overrides: Partial<Invite> = {}): Invite => ({
  id,
  email: `${id}@example.com`,
  role: "staff",
  invitedBy: "a1",
  createdAt: NOW,
  expiresAt: new Date("2026-10-27T12:00:00Z"),
  acceptedAt: null,
  acceptedBy: null,
  revokedAt: null,
  ...overrides,
});

describe("InvitesPanel", () => {
  beforeEach(() => vi.clearAllMocks());

  it("creates an invitation and shows its full link once, ready to copy", async () => {
    const create = vi.fn<CreateInviteAction>(async () => ({ ok: true, invite: invite("ana"), path: "/invite/secret123", emailed: false }));
    const writeText = vi.fn(async () => {});
    Object.assign(navigator, { clipboard: { writeText } });
    render(<InvitesPanel invites={[]} assignable={["staff", "organizer", "admin"]} create={create} revoke={vi.fn()} origin="https://arcade.example" now={() => NOW} />);

    fireEvent.change(screen.getByLabelText(t.emailLabel), { target: { value: " Ana@Example.com " } });
    fireEvent.click(screen.getByRole("radio", { name: copy.admin.team.roles.organizer }));
    fireEvent.click(screen.getByRole("button", { name: t.create }));

    await waitFor(() => expect(create).toHaveBeenCalledWith({ email: "ana@example.com", role: "organizer" }));
    expect(await screen.findByText("https://arcade.example/invite/secret123")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: t.copy }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("https://arcade.example/invite/secret123"));
    expect(screen.getByRole("button", { name: t.copied })).toBeInTheDocument();
  });

  it("offers an organizer no role choice (staff only), and checks the email first", async () => {
    const create = vi.fn<CreateInviteAction>();
    render(<InvitesPanel invites={[]} assignable={["staff"]} create={create} revoke={vi.fn()} now={() => NOW} />);

    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: t.create }));
    expect(await screen.findByText(t.errors["invalid-email"])).toBeInTheDocument();
    expect(create).not.toHaveBeenCalled();
  });

  it("lists each invitation's state and revokes a pending one it may touch", async () => {
    const revoke = vi.fn<RevokeInviteAction>(async () => ({ ok: true }));
    render(
      <InvitesPanel
        invites={[invite("ana"), invite("bob", { acceptedAt: NOW }), invite("cid", { expiresAt: NOW }), invite("dan", { role: "organizer" })]}
        assignable={["staff"]}
        create={vi.fn()}
        revoke={revoke}
        now={() => NOW}
      />,
    );
    const row = (email: string) => screen.getByText(email).closest("li") as HTMLElement;

    expect(row("ana@example.com")).toHaveTextContent(t.states.pending);
    expect(row("bob@example.com")).toHaveTextContent(t.states.accepted);
    expect(row("cid@example.com")).toHaveTextContent(t.states.expired);
    expect(within(row("dan@example.com")).queryByRole("button")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Anular la invitación de ana@example.com" }));
    await waitFor(() => expect(revoke).toHaveBeenCalledWith({ id: "ana" }));
    expect(await screen.findByText(t.revokedDone)).toBeInTheDocument();
  });

  it("has no accessibility violations", async () => {
    const { container } = render(<InvitesPanel invites={[invite("ana")]} assignable={["staff", "admin"]} create={vi.fn()} revoke={vi.fn()} now={() => NOW} />);
    expect((await axe(container)).violations).toEqual([]);
  });
});

describe("InviteAcceptPanel", () => {
  const actions = (): AuthActions & { [K in keyof AuthActions]: ReturnType<typeof vi.fn> } =>
    ({
      signInWithGoogle: vi.fn(async () => ({ ok: true, value: "signed-in" })),
      completeSignIn: vi.fn(),
      refreshSession: vi.fn(async () => ({ ok: true, value: undefined })),
      signOut: vi.fn(async () => ({ ok: true, value: undefined })),
    }) as never;
  const renderPanel = (props: Partial<Parameters<typeof InviteAcceptPanel>[0]>, auth = actions()) => {
    const accept = props.accept ?? vi.fn<AcceptInviteAction>(async () => ({ ok: true, role: "organizer" }));
    render(
      <AuthActionsProvider actions={auth}>
        <InviteAcceptPanel secret="s3cret" role="organizer" maskedEmail="an•••@example.com" state="pending" signedIn={false} accept={accept} {...props} />
      </AuthActionsProvider>,
    );
    return { accept, auth };
  };

  beforeEach(() => vi.clearAllMocks());

  it("says who it is for, signs in with Google, accepts, renews the session and goes to the role's home", async () => {
    const { accept, auth } = renderPanel({});

    expect(screen.getByText(/como organizador de esta edición/)).toHaveTextContent("an•••@example.com");
    fireEvent.click(screen.getByRole("button", { name: i.signInAndAccept }));

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/admin"));
    expect(auth.signInWithGoogle).toHaveBeenCalled();
    expect(accept).toHaveBeenCalledWith({ secret: "s3cret" });
    expect(auth.refreshSession).toHaveBeenCalled();
  });

  it("skips Google when already signed in", async () => {
    const { auth } = renderPanel({ signedIn: true, role: "staff", accept: vi.fn(async () => ({ ok: true as const, role: "staff" as const })) });

    fireEvent.click(screen.getByRole("button", { name: i.accept }));

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/staff"));
    expect(auth.signInWithGoogle).not.toHaveBeenCalled();
  });

  it("never lands on the new home with the old role: when the session cannot be renewed it asks to sign in again", async () => {
    const auth = actions();
    auth.refreshSession.mockResolvedValue({ ok: false, error: { code: "unauthenticated" } });
    renderPanel({ signedIn: true, role: "admin", accept: vi.fn(async () => ({ ok: true as const, role: "admin" as const })) }, auth);

    fireEvent.click(screen.getByRole("button", { name: i.accept }));

    expect(await screen.findByText(i.reSignIn)).toHaveAttribute("role", "status");
    expect(router.replace).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: i.reSignInButton }));
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/admin"));
    expect(auth.signInWithGoogle).toHaveBeenCalled();
  });

  it("explains another account and offers to change it", async () => {
    renderPanel({ signedIn: true, accept: vi.fn(async () => ({ ok: false as const, code: "wrong-account" as const })) });

    fireEvent.click(screen.getByRole("button", { name: i.accept }));

    expect(await screen.findByText(i.errors["wrong-account"])).toBeInTheDocument();
    expect(screen.getByRole("button", { name: copy.auth.signOut })).toBeInTheDocument();
    expect(router.replace).not.toHaveBeenCalled();
  });

  it("shows a used, expired or revoked link without the button", () => {
    renderPanel({ state: "expired" });

    expect(screen.getByText(i.errors.expired)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: i.signInAndAccept })).not.toBeInTheDocument();
  });
});
