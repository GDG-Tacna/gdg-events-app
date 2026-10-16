// @vitest-environment jsdom
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { copy } from "@/shared/copy/es";
import { err, ok, type Result } from "@/shared/lib/result";
import { axe } from "@/test-utils/axe";
import { fakeQrCamera } from "@/test-utils/fake-qr-camera";
import type { ConnectContactAction, ConnectContactActionResult, IssueContactCodeAction, SaveContactLinksAction } from "./actions";
import { CadetCardView } from "./CadetCardView";
import { NetworkView, type NetworkViewProps } from "./NetworkView";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

const t = copy.network;
const NO_LINKS = { linkedin: null, github: null, web: null };
const ME = { alias: "Ana", squad: "Firebase", links: { ...NO_LINKS, github: "https://github.com/ana" } };
const BRUNO = { id: "p1", alias: "Bruno", squad: null, links: { ...NO_LINKS, web: "https://bruno.dev/" } };
const CARLA = { id: "p2", alias: "Carla", squad: "Angular", links: NO_LINKS };

/** A fake camera that starts (or fails to start, like the real one would) and can be shown a code. */
function fakeScanner(startResult: Result<void, { code: "denied" }> = ok(undefined)) {
  const fake = fakeQrCamera(startResult.ok ? undefined : startResult.error.code);
  return { scanner: fake.camera, see: fake.see, fake };
}

const issue: IssueContactCodeAction = async () => ({ ok: true, code: { cells: ["101", "010", "101"], issuedAt: Date.now(), expiresAt: Date.now() + 120_000 } });
const connected = (overrides: Partial<Extract<ConnectContactActionResult, { ok: true }>> = {}): ConnectContactActionResult => ({
  ok: true,
  card: { alias: "Dora", squad: "Gemini", links: { ...NO_LINKS, linkedin: "https://www.linkedin.com/in/dora" } },
  created: true,
  xpEarned: 20,
  creditsEarned: 5,
  capReached: false,
  achievements: [],
  ...overrides,
});

async function renderView(overrides: Partial<NetworkViewProps> = {}) {
  const { scanner, see, fake } = fakeScanner();
  const props: NetworkViewProps = {
    me: ME,
    contacts: [BRUNO, CARLA],
    reward: { xp: 20, credits: 5, cap: 10 },
    issue,
    connect: vi.fn<ConnectContactAction>(async () => connected()),
    saveLinks: vi.fn<SaveContactLinksAction>(async (input) => ({ ok: true, links: { linkedin: null, github: input.github ? `https://github.com/${input.github}` : null, web: null } })),
    camera: scanner,
    ...overrides,
  };
  const view = render(<NetworkView {...props} />);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
  return { ...view, props, see, fake };
}

const openTab = async (name: RegExp | string) => {
  fireEvent.click(screen.getByRole("tab", { name }));
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date"] });
  refresh.mockReset();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("NetworkView", () => {
  it("opens on the cadet's own code and card, with the reward and how many contacts paid", async () => {
    await renderView({ contacts: [BRUNO], reward: { xp: 20, credits: 5, cap: 10 } });

    expect(screen.getByRole("heading", { level: 1, name: t.title })).toBeInTheDocument();
    expect(screen.getByText("Por contacto nuevo: +20 XP · +5 G-Credits")).toBeInTheDocument();
    expect(screen.getByText("Contactos con premio: 1 de 10")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: t.tabs.code })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("img", { name: t.code.label })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Ana" })).toBeInTheDocument();
    expect(screen.getByText("Firebase")).toBeInTheDocument();
  });

  it("does not offer a reward when contacts pay nothing, and shows only the XP when credits pay none", async () => {
    const { unmount } = await renderView({ reward: { xp: 0, credits: 0, cap: 10 } });
    expect(screen.queryByText(/Por contacto nuevo/)).not.toBeInTheDocument();
    unmount();

    await renderView({ reward: { xp: 15, credits: 0, cap: 10 } });
    expect(screen.getByText("Por contacto nuevo: +15 XP")).toBeInTheDocument();
  });

  it("never turns the camera on until the Escanear tab is open, and turns it off when leaving", async () => {
    const { fake } = await renderView();
    expect(fake.record.mounts).toBe(0);

    await openTab(t.tabs.scan);
    expect(fake.record.mounts).toBe(1);
    expect(screen.getByText(t.scan.hint)).toBeInTheDocument();

    await openTab(/Contactos/);
    expect(fake.record.unmounts).toBe(1);
  });

  it("moves between tabs with the arrow keys", async () => {
    await renderView();

    fireEvent.keyDown(screen.getByRole("tab", { name: t.tabs.code }), { key: "ArrowLeft" });

    expect(screen.getByRole("tab", { name: /Contactos/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: /Contactos/ })).toHaveFocus();
    fireEvent.keyDown(screen.getByRole("tab", { name: /Contactos/ }), { key: "ArrowRight" });
    expect(screen.getByRole("tab", { name: t.tabs.code })).toHaveAttribute("aria-selected", "true");
  });

  it("connects with a scanned cadet: their card, what it paid, and the list refreshed", async () => {
    const { see, props } = await renderView();
    await openTab(t.tabs.scan);

    await see("devfest:ct:dora");

    expect(props.connect).toHaveBeenCalledWith("devfest:ct:dora");
    expect(screen.getByRole("heading", { level: 2, name: t.scan.created.title })).toHaveFocus();
    expect(screen.getByRole("heading", { name: "Dora" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "LinkedIn de Dora (se abre en otra pestaña)" })).toHaveAttribute("href", "https://www.linkedin.com/in/dora");
    expect(screen.getByText("+20 XP")).toBeInTheDocument();
    expect(screen.getByText("+5 G-Credits")).toBeInTheDocument();
    expect(refresh).toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: t.scan.toContacts }));
    expect(screen.getByRole("tab", { name: /Contactos/ })).toHaveAttribute("aria-selected", "true");
  });

  it("says when the two were already contacts, or when the cadet is past the cap, without refreshing", async () => {
    const connect = vi.fn<ConnectContactAction>().mockResolvedValueOnce(connected({ created: false, xpEarned: 0, creditsEarned: 0 })).mockResolvedValueOnce(connected({ xpEarned: 0, creditsEarned: 0, capReached: true }));
    const { see } = await renderView({ connect });
    await openTab(t.tabs.scan);

    await see("devfest:ct:dora");
    expect(screen.getByRole("heading", { level: 2, name: t.scan.already.title })).toBeInTheDocument();
    expect(screen.queryByText("+20 XP")).not.toBeInTheDocument();
    expect(refresh).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: t.scan.again }));
    await see("devfest:ct:eva");
    expect(screen.getByText(t.scan.capReached)).toBeInTheDocument();
  });

  it("explains a refused code and offers to try again", async () => {
    const { see } = await renderView({ connect: vi.fn<ConnectContactAction>(async () => ({ ok: false, code: "self" })) });
    await openTab(t.tabs.scan);

    await see("devfest:ct:ana");

    expect(screen.getByRole("heading", { level: 2, name: t.errors.self.title })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: t.scan.retry })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: t.scan.toContacts })).not.toBeInTheDocument();
  });

  it("explains a camera problem and tries again on request", async () => {
    const { scanner, fake } = fakeScanner(err({ code: "denied" }));
    await renderView({ camera: scanner });
    await openTab(t.tabs.scan);

    expect(screen.getByRole("heading", { level: 2, name: copy.scanner.cameraErrors.denied.title })).toBeInTheDocument();
    fake.record.failWith = undefined;
    fireEvent.click(screen.getByRole("button", { name: t.scan.retry }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(fake.record.mounts).toBe(2);
    expect(screen.getByText(t.scan.hint)).toBeInTheDocument();
  });

  it("lists the contacts newest first, or says there are none yet", async () => {
    const { unmount } = await renderView();
    await openTab(/Contactos/);

    const list = screen.getByRole("list", { name: t.contacts.label });
    expect(within(list).getAllByRole("heading").map((heading) => heading.textContent)).toEqual(["Bruno", "Carla"]);
    expect(within(list).getByRole("link", { name: "Web de Bruno (se abre en otra pestaña)" })).toHaveAttribute("rel", "noopener noreferrer nofollow");
    expect(screen.getByRole("tab", { name: "Contactos (2)" })).toBeInTheDocument();
    unmount();

    await renderView({ contacts: [] });
    await openTab(/Contactos/);
    expect(screen.getByText(t.contacts.empty)).toBeInTheDocument();
  });

  it("edits the links on the card and shows them at once", async () => {
    const { props } = await renderView();

    fireEvent.click(screen.getByRole("button", { name: t.links.edit }));
    expect(screen.getByLabelText(t.links.github)).toHaveValue("https://github.com/ana");
    fireEvent.change(screen.getByLabelText(t.links.github), { target: { value: "ana-dev" } });
    fireEvent.click(screen.getByRole("button", { name: t.links.save }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(props.saveLinks).toHaveBeenCalledWith({ linkedin: "", github: "ana-dev", web: "" });
    expect(screen.getByRole("status")).toHaveTextContent(t.links.saved);
    expect(screen.getByRole("link", { name: "GitHub de Ana (se abre en otra pestaña)" })).toHaveAttribute("href", "https://github.com/ana-dev");
  });

  it("shows a refused link on its field and keeps the form open; cancels without saving", async () => {
    const saveLinks = vi.fn<SaveContactLinksAction>().mockResolvedValueOnce({ ok: false, code: "invalid-web" }).mockRejectedValueOnce(new Error("offline"));
    await renderView({ saveLinks });

    fireEvent.click(screen.getByRole("button", { name: t.links.edit }));
    fireEvent.change(screen.getByLabelText(t.links.web), { target: { value: "javascript:alert(1)" } });
    fireEvent.click(screen.getByRole("button", { name: t.links.save }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByLabelText(t.links.web)).toHaveAccessibleDescription(expect.stringContaining(t.errors["invalid-web"].body));

    fireEvent.click(screen.getByRole("button", { name: t.links.save }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByRole("alert")).toHaveTextContent(t.errors.unknown.body);

    fireEvent.click(screen.getByRole("button", { name: t.links.cancel }));
    expect(screen.queryByLabelText(t.links.web)).not.toBeInTheDocument();
    expect(saveLinks).toHaveBeenCalledTimes(2);
  });
});

describe("CadetCardView", () => {
  it("shows a cadet without squad or links plainly", () => {
    render(<CadetCardView card={{ alias: "Eva", squad: null, links: NO_LINKS }} />);

    expect(screen.getByRole("heading", { level: 3, name: "Eva" })).toBeInTheDocument();
    expect(screen.getByText(t.card.noSquad)).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
});

describe("accessibility", () => {
  it("has no detectable violations on each tab", async () => {
    vi.useRealTimers();
    const { scanner } = fakeScanner();
    const { container } = render(
      <NetworkView me={ME} contacts={[BRUNO, CARLA]} reward={{ xp: 20, credits: 5, cap: 10 }} issue={issue} connect={vi.fn()} saveLinks={vi.fn()} camera={scanner} />,
    );
    await screen.findByRole("img", { name: t.code.label });
    expect((await axe(container)).violations).toEqual([]);

    fireEvent.click(screen.getByRole("button", { name: t.links.edit }));
    expect((await axe(container)).violations).toEqual([]);

    fireEvent.click(screen.getByRole("tab", { name: /Contactos/ }));
    expect((await axe(container)).violations).toEqual([]);

    fireEvent.click(screen.getByRole("tab", { name: t.tabs.scan }));
    await screen.findByText(t.scan.hint);
    expect((await axe(container)).violations).toEqual([]);
  });
});
