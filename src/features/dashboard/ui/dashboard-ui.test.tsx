// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AuthActionsProvider, type AuthActions } from "@/features/auth";
import { copy } from "@/shared/copy/es";
import { formatNumber, interpolate } from "@/shared/lib/format";
import { ok } from "@/shared/lib/result";
import { axe } from "@/test-utils/axe";
import { buildOverview, type DashboardOverview } from "../domain/overview";
import { DashboardView } from "./DashboardView";
import { PlayerCard } from "./PlayerCard";
import { SquadCallout } from "./SquadCallout";
import { WelcomeBanner } from "./WelcomeBanner";

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }) }));

const SPRITE = { rows: ["xx", "xx"], palette: { x: "#ffffff" } };
const PREVIEWS = [
  { id: "angular", sprite: SPRITE },
  { id: "firebase", sprite: SPRITE },
  { id: "gemini", sprite: SPRITE },
];

const overview = (xp: number, overrides: Partial<DashboardOverview> = {}): DashboardOverview => ({
  ...buildOverview({
    uid: "u1",
    alias: "Nova_7",
    role: "attendee",
    squad: null,
    xp,
    credits: 12,
    createdAt: new Date("2026-10-04T12:00:00Z"),
  }),
  ...overrides,
});

const actions: AuthActions = {
  signInWithGoogle: vi.fn(async () => ok("signed-in" as const)),
  completeSignIn: vi.fn(async () => ok(false)),
  refreshSession: vi.fn(async () => ok(undefined)),
  signOut: vi.fn(async () => ok(undefined)),
};

const renderView = (props: Partial<Parameters<typeof DashboardView>[0]> = {}) =>
  render(
    <AuthActionsProvider actions={actions}>
      <DashboardView
        overview={overview(120)}
        squadCallout="none"
        squadPreviews={PREVIEWS}
        squadHref="/squad"
        {...props}
      />
    </AuthActionsProvider>,
  );

describe("PlayerCard", () => {
  it("offers the cadet's QR from a button on the card, only when given where it is", () => {
    const { unmount } = render(<PlayerCard overview={overview(120)} qrHref="/pass" />);

    const button = screen.getByRole("link", { name: copy.pass.open });
    expect(button).toHaveAttribute("href", "/pass");
    expect(button.className).toContain("size-12");
    unmount();

    render(<PlayerCard overview={overview(120)} />);
    expect(screen.queryByRole("link", { name: copy.pass.open })).not.toBeInTheDocument();
  });

  it("shows the alias, the rank with its level and the labelled region", () => {
    render(<PlayerCard overview={overview(120)} />);

    expect(screen.getByRole("region", { name: copy.dashboard.attendeeCardLabel })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Nova_7" })).toBeInTheDocument();
    expect(screen.getByText("NV 2")).toBeInTheDocument();
    expect(screen.getByText(copy.ranks.pilot)).toBeInTheDocument();
  });

  it("shows the progress to the next rank, visually and to assistive tech", () => {
    render(<PlayerCard overview={overview(750)} />);
    const values = { xp: formatNumber(750), next: formatNumber(2000) };
    const bar = screen.getByRole("progressbar", { name: copy.dashboard.progressLabel });

    expect(screen.getByText(interpolate(copy.dashboard.progressCaption, values))).toBeInTheDocument();
    expect(bar).toHaveAttribute("aria-valuetext", interpolate(copy.dashboard.progressSpoken, values));
    expect(bar).toHaveAttribute("aria-valuenow", "16"); // 250 of the 1500 XP of Comandante
  });

  it("says the top rank is reached instead of showing a target", () => {
    render(<PlayerCard overview={overview(2500)} />);
    const bar = screen.getByRole("progressbar");

    expect(screen.getByText(copy.dashboard.maxRank)).toBeInTheDocument();
    expect(bar).toHaveAttribute("aria-valuetext", copy.dashboard.maxRank);
    expect(bar).toHaveAttribute("aria-valuenow", "100");
    expect(screen.queryByText(/ \/ /)).not.toBeInTheDocument();
  });

  it("shows XP and credits with their labels", () => {
    render(<PlayerCard overview={overview(1250, { credits: 3400 })} />);

    expect(screen.getByText(formatNumber(1250))).toBeInTheDocument();
    expect(screen.getByText(copy.dashboard.xpLabel)).toBeInTheDocument();
    expect(screen.getByText(formatNumber(3400))).toBeInTheDocument();
    expect(screen.getByText(copy.dashboard.creditsLabel)).toBeInTheDocument();
  });

  it("shows the wallet across editions, with what this event earned under it", () => {
    render(<PlayerCard overview={overview(100, { credits: 40, walletBalance: 520 })} />);

    expect(screen.getByText(formatNumber(520))).toBeInTheDocument();
    expect(screen.getByText(interpolate(copy.dashboard.creditsThisEvent, { n: "40" }))).toBeInTheDocument();
  });

  it("falls back to this event's credits when the wallet cannot be read, and hides credits when they are off", () => {
    const { unmount } = render(<PlayerCard overview={overview(100, { credits: 40, walletBalance: null })} />);
    expect(screen.getByText("40")).toBeInTheDocument();
    expect(screen.queryByText(/en este evento/)).not.toBeInTheDocument();
    unmount();

    render(<PlayerCard overview={overview(100, { creditsEnabled: false, walletBalance: 520 })} />);
    expect(screen.queryByText(copy.dashboard.creditsLabel)).not.toBeInTheDocument();
    expect(screen.queryByText(formatNumber(520))).not.toBeInTheDocument();
  });

  it("shows the squad slot only when one is given", () => {
    const { rerender } = render(<PlayerCard overview={overview(0)} />);
    expect(screen.queryByText("Escuadrón Angular")).not.toBeInTheDocument();

    rerender(<PlayerCard overview={overview(0)} squadSlot={<span>Escuadrón Angular</span>} />);
    expect(screen.getByText("Escuadrón Angular")).toBeInTheDocument();
  });

  it("keeps a long alias from breaking the layout", () => {
    render(<PlayerCard overview={overview(0, { alias: "x".repeat(16) })} />);

    expect(screen.getByRole("heading", { level: 2 }).className).toContain("truncate");
  });

  it("draws the same avatar for the same alias and keeps it decorative", () => {
    const first = render(<PlayerCard overview={overview(0)} />);
    const second = render(<PlayerCard overview={overview(900)} />);
    // The HD avatar: 32x32 art at scale 2.
    const avatar = (container: HTMLElement) => container.querySelector("svg[viewBox='0 0 32 32']");

    expect(avatar(first.container)).toHaveAttribute("width", "64");
    expect(avatar(first.container)?.innerHTML).toBe(avatar(second.container)?.innerHTML);
    expect(avatar(first.container)).toHaveAttribute("aria-hidden", "true");
  });
});

describe("WelcomeBanner", () => {
  it("welcomes the attendee by alias on behalf of GDG Tacna", () => {
    render(<WelcomeBanner alias="Nova_7" />);

    expect(screen.getByText(copy.dashboard.welcomeGreeting, { exact: false })).toHaveTextContent("Nova_7");
    const body = copy.dashboard.welcomeBody;
    expect(screen.getByText(body.community).tagName).toBe("STRONG");
    expect(screen.getByText(body.event).tagName).toBe("STRONG");
    expect(screen.getByText(body.community).parentElement).toHaveTextContent(`${body.before}${body.community}${body.middle}${body.event}${body.after}`);
  });
});

describe("SquadCallout", () => {
  it("invites the attendee to the reveal with a real link and one logo per squad", () => {
    const { container } = render(<SquadCallout previews={PREVIEWS} href="/squad" />);

    expect(screen.getByRole("heading", { level: 2, name: copy.dashboard.squadCalloutTitle })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: copy.reveal.discover })).toHaveAttribute("href", "/squad");
    expect(container.querySelectorAll("svg")).toHaveLength(PREVIEWS.length);
  });

  it("copes with a catalog that offers a different number of squads", () => {
    const { container } = render(<SquadCallout previews={PREVIEWS.slice(0, 1)} href="/squad" />);

    expect(container.querySelectorAll("svg")).toHaveLength(1);
  });
});

describe("DashboardView", () => {
  const terminal = () => screen.getByRole("region", { name: copy.dashboard.terminal.title });
  const order = (...names: string[]) => names.map((name) => screen.getByRole("region", { name }));
  const follows = (a: HTMLElement, b: HTMLElement) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

  it("puts the cadet's QR button on the attendee card", () => {
    renderView({ qrHref: "/pass" });

    const card = screen.getByRole("region", { name: copy.dashboard.attendeeCardLabel });
    expect(within(card).getByRole("link", { name: copy.pass.open })).toHaveAttribute("href", "/pass");
  });

  it("has the brand, the screen title for screen readers, the welcome, and on the header the account menu and sign out", () => {
    renderView({ qrHref: "/pass", networkHref: "/red" });

    expect(screen.getByRole("heading", { level: 1, name: copy.dashboard.title })).toHaveClass("sr-only");
    expect(screen.getByText(copy.dashboard.welcomeBody.community)).toBeInTheDocument();
    const header = screen.getByRole("banner");
    expect(within(header).getByRole("button", { name: copy.dashboard.account.open })).toBeInTheDocument();
    // Sign out lives on the header, never inside the content where it gets lost.
    expect(within(header).getByRole("button", { name: copy.auth.signOut }).className).toContain("size-12");
    expect(screen.getAllByRole("button", { name: copy.auth.signOut })).toHaveLength(1);
  });

  it("leaves the account menu out when it would be empty", () => {
    renderView();

    expect(screen.queryByRole("button", { name: copy.dashboard.account.open })).not.toBeInTheDocument();
  });

  it("shows the squad badge inside the attendee card when the attendee has a squad, and no invitation", () => {
    renderView({ squadCallout: "badge", squadBadge: <span>Escuadrón Firebase</span> });

    const card = screen.getByRole("region", { name: copy.dashboard.attendeeCardLabel });
    expect(within(card).getByText("Escuadrón Firebase")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: copy.reveal.discover })).not.toBeInTheDocument();
  });

  it("puts the ranking and the welcome in the cadet's column, under the attendee card", () => {
    renderView({ standingSlot: <section aria-label="Ranking">#3</section> });

    const [card, ranking] = order(copy.dashboard.attendeeCardLabel, "Ranking");
    expect(follows(card, ranking)).toBe(true);
    expect(terminal()).not.toContainElement(ranking);
    expect(terminal()).not.toContainElement(screen.getByText(copy.dashboard.welcomeBody.community));
  });

  it("lists the terminal's entries in order: missions, Red, QR, raffle, squad credits (members only), install", () => {
    renderView({
      squadCallout: "badge",
      missionsSlot: <section aria-label="Misiones">+500 XP</section>,
      networkSlot: <section aria-label="Red">Tus contactos</section>,
      passSlot: <section aria-label="Pase">Tu QR</section>,
      raffleSlot: <section aria-label="Sorteo">Boletos</section>,
      squadCreditsSlot: <section aria-label="Créditos del escuadrón">40</section>,
      installSlot: <section aria-label="Instalar">Cómo instalar</section>,
    });

    const entries = order("Misiones", "Red", "Pase", "Sorteo", "Créditos del escuadrón", "Instalar");
    for (const entry of entries) expect(terminal()).toContainElement(entry);
    for (let i = 1; i < entries.length; i += 1) expect(follows(entries[i - 1], entries[i])).toBe(true);
  });

  it("shows nothing for a missing entry", () => {
    renderView();

    expect(within(terminal()).queryAllByRole("region")).toEqual([]);
  });

  it("shows the squad credits card only to a squad member", () => {
    const slots = { squadCreditsSlot: <section aria-label="Créditos del escuadrón">40</section> };
    const newcomer = renderView({ ...slots, squadCallout: "discover" });
    expect(screen.queryByRole("region", { name: "Créditos del escuadrón" })).not.toBeInTheDocument();
    newcomer.unmount();
    renderView({ ...slots, squadCallout: "none" });
    expect(screen.queryByRole("region", { name: "Créditos del escuadrón" })).not.toBeInTheDocument();
  });

  it("invites an attendee without a squad to discover it, at the top of the terminal, and shows no badge", () => {
    renderView({ squadCallout: "discover", squadBadge: <span>Escuadrón Firebase</span> });

    expect(within(terminal()).getByRole("link", { name: copy.reveal.discover })).toHaveAttribute("href", "/squad");
    expect(screen.queryByText("Escuadrón Firebase")).not.toBeInTheDocument();
  });

  it("shows nothing about squads when the feature is off or there is nothing to assign", () => {
    renderView({ squadCallout: "none", squadBadge: <span>Escuadrón Firebase</span> });

    expect(screen.queryByRole("link", { name: copy.reveal.discover })).not.toBeInTheDocument();
    expect(screen.queryByText("Escuadrón Firebase")).not.toBeInTheDocument();
  });

  it("is one column on phones and two from 760px", () => {
    const { container } = renderView();
    const grid = container.querySelector(".grid.min-\\[760px\\]\\:grid-cols-2");

    expect(grid).toBeInTheDocument();
    expect(grid?.className).not.toMatch(/(^|\s)grid-cols-2(\s|$)/); // no fixed two columns on phones
  });

  it.each(["none", "badge", "discover"] as const)("has no detectable accessibility violations (%s)", async (squadCallout) => {
    const { container } = renderView({ squadCallout, squadBadge: <span>Escuadrón Firebase</span>, qrHref: "/pass", networkHref: "/red" });

    expect((await axe(container)).violations).toEqual([]);
  });
});
