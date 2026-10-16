// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthActionsProvider, type AuthActions } from "@/features/auth";
import { copy } from "@/shared/copy/es";
import { axe } from "@/test-utils/axe";
import type { Speaker } from "../domain/speaker";
import type { AcceptSpeakerInviteAction, InviteSpeakerAction, SpeakerAccessView, UnlinkSpeakerAction } from "./actions";
import { SpeakerInvitePanel } from "./SpeakerInvitePanel";
import { SpeakersAdminView } from "./SpeakersAdminView";

const router = vi.hoisted(() => ({ refresh: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

const t = copy.admin.speakers;
const a = t.access;
const ANA: Speaker = { id: "ana-torres", name: "Ana Torres", headline: "", bio: "", photo: null, links: { linkedin: null, github: null, web: null }, active: true };
const ZOE: Speaker = { ...ANA, id: "zoe", name: "Zoe", active: false };

function renderView(states: Record<string, SpeakerAccessView>) {
  const invite = vi.fn<InviteSpeakerAction>(async () => ({ ok: true, path: "/invite/speaker/devfest-2026.secret" }));
  const unlink = vi.fn<UnlinkSpeakerAction>(async () => ({ ok: true }));
  const ok = async () => ({ ok: true as const });
  const view = render(<SpeakersAdminView speakers={[ANA, ZOE]} create={ok} update={ok} setActive={ok} upload={vi.fn()} access={{ states, invite, unlink, origin: "https://app.test" }} />);
  return { invite, unlink, view, user: userEvent.setup() };
}

describe("speaker access on the Speakers screen", () => {
  beforeEach(() => vi.clearAllMocks());

  it("says on each card who holds the speaker's code, and offers access only to active speakers", () => {
    renderView({ "ana-torres": { state: "linked", email: "an•••@gmail.com" }, zoe: { state: "none" } });

    expect(screen.getByText("Cuenta vinculada: an•••@gmail.com")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: `${t.accessButton}: Ana Torres` })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: `${t.accessButton}: Zoe` })).not.toBeInTheDocument();
  });

  it("makes a link for the speaker's email, shown once to copy", async () => {
    const { invite, user } = renderView({ "ana-torres": { state: "none" } });

    await user.click(screen.getByRole("button", { name: `${t.accessButton}: Ana Torres` }));
    const dialog = screen.getByRole("dialog", { name: a.title });
    await user.type(within(dialog).getByLabelText(a.email), "ana@gmail.com");
    await user.click(within(dialog).getByRole("button", { name: a.create }));

    expect(invite).toHaveBeenCalledWith({ speakerId: "ana-torres", email: "ana@gmail.com" });
    expect(await within(dialog).findByText("https://app.test/invite/speaker/devfest-2026.secret")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: a.copy })).toBeInTheDocument();
    expect(router.refresh).toHaveBeenCalled();
  });

  it("shows a pending invitation, a refusal, and takes access away", async () => {
    const { invite, unlink, user } = renderView({ "ana-torres": { state: "invited", email: "an•••@gmail.com", expiresAt: new Date("2026-10-30T15:00:00Z"), expired: false } });
    invite.mockResolvedValueOnce({ ok: false, code: "invalid-email" });

    await user.click(screen.getByRole("button", { name: `${t.accessButton}: Ana Torres` }));
    const dialog = screen.getByRole("dialog", { name: a.title });
    expect(within(dialog).getByText(/Invitación para an•••@gmail.com, vence el/)).toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: a.replace }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(a.errors["invalid-email"]);

    await user.click(within(dialog).getByRole("button", { name: a.unlink }));
    expect(unlink).toHaveBeenCalledWith({ speakerId: "ana-torres" });
    expect(await within(dialog).findByText(a.unlinkedDone)).toHaveAttribute("role", "status");
    expect(within(dialog).queryByRole("button", { name: a.unlink })).not.toBeInTheDocument();
  });

  it("has no detectable accessibility violations with the dialog open", async () => {
    const { user } = renderView({ "ana-torres": { state: "linked", email: null } });

    await user.click(screen.getByRole("button", { name: `${t.accessButton}: Ana Torres` }));
    expect((await axe(document.body)).violations).toEqual([]);
  });
});

describe("SpeakerInvitePanel", () => {
  const p = copy.speakerInvite;
  const auth = () =>
    ({
      signInWithGoogle: vi.fn(async () => ({ ok: true, value: "signed-in" })),
      completeSignIn: vi.fn(),
      refreshSession: vi.fn(async () => ({ ok: true, value: undefined })),
      signOut: vi.fn(async () => ({ ok: true, value: undefined })),
    }) as unknown as AuthActions & { signInWithGoogle: ReturnType<typeof vi.fn> };

  function renderPanel(props: Partial<Parameters<typeof SpeakerInvitePanel>[0]> = {}, actions = auth()) {
    const accept = props.accept ?? vi.fn<AcceptSpeakerInviteAction>(async () => ({ ok: true }));
    const view = render(
      <AuthActionsProvider actions={actions}>
        <SpeakerInvitePanel token="devfest-2026.secret" name="Ana Torres" maskedEmail="an•••@gmail.com" state="pending" signedIn={false} accept={accept} homeHref="/speaker" {...props} />
      </AuthActionsProvider>,
    );
    return { accept, actions, view };
  }

  beforeEach(() => vi.clearAllMocks());

  it("says whose code it is, signs in with Google, links the account and opens the code", async () => {
    const { accept, actions } = renderPanel();

    expect(screen.getByText(/Ana Torres/)).toHaveTextContent("an•••@gmail.com");
    fireEvent.click(screen.getByRole("button", { name: p.signInAndAccept }));

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/speaker"));
    expect(actions.signInWithGoogle).toHaveBeenCalled();
    expect(accept).toHaveBeenCalledWith({ token: "devfest-2026.secret" });
  });

  it("explains a refusal and offers to switch accounts", async () => {
    renderPanel({ signedIn: true, accept: vi.fn(async () => ({ ok: false as const, code: "wrong-account" as const })) });

    fireEvent.click(screen.getByRole("button", { name: p.accept }));

    expect(await screen.findByText(p.errors["wrong-account"])).toBeInTheDocument();
    expect(router.replace).not.toHaveBeenCalled();
  });

  it("has nothing to do with an expired link but say so", async () => {
    const { view } = renderPanel({ state: "expired" });

    expect(screen.getByText(p.errors.expired)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: p.signInAndAccept })).not.toBeInTheDocument();
    expect((await axe(view.container)).violations).toEqual([]);
  });
});
