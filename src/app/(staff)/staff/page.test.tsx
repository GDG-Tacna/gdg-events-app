// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { copy } from "@/shared/copy/es";
import { axe } from "@/test-utils/axe";

vi.mock("server-only", () => ({}));
vi.mock("@/app-shell/composition/checkpoints.server", () => ({ serveDeps: { marker: "deps" } }));

const guards = { requireRole: vi.fn(), teamPlayState: vi.fn() };
vi.mock("@/app-shell/guards", () => guards);
const permissions = vi.hoisted(() => ({ staffStations: vi.fn(), staffCheckpoints: vi.fn() }));
vi.mock("@/app-shell/permissions.server", () => permissions);

const server = { listServePoints: vi.fn() };
vi.mock("@/features/checkpoints/server", () => server);

const { default: StaffHomePage } = await import("./page");

/** Opens a puesto's «⋯» menu. */
const openMenu = (puesto: string) => userEvent.click(screen.getByRole("button", { name: `${copy.staff.moreActions}: ${puesto}` }));

describe("staff home page", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    guards.requireRole.mockResolvedValue({ uid: "s1", role: "staff", displayName: null, photoUrl: null });
    guards.teamPlayState.mockResolvedValue("off");
    permissions.staffStations.mockResolvedValue(["entrance", "catering", "stand"]);
    permissions.staffCheckpoints.mockResolvedValue(undefined);
    server.listServePoints.mockResolvedValue({
      ok: true,
      value: [
        { id: "entrance-main", kind: "entrance", name: "Entrada principal", servedCount: 80 },
        { id: "lunch-1", kind: "catering", name: "Almuerzo", servedCount: 120 },
        { id: "coffee-1", kind: "catering", name: "Coffee break", servedCount: null },
        { id: "stand-cloud", kind: "stand", name: "Stand Cloud", servedCount: 12 },
      ],
    });
  });

  it("checks the staff role itself and lists the stations as the session's user", async () => {
    await StaffHomePage();

    expect(guards.requireRole).toHaveBeenCalledWith(["staff"]);
    expect(server.listServePoints).toHaveBeenCalledWith({ marker: "deps" }, { uid: "s1", role: "staff", kinds: ["entrance", "catering", "stand"] });
  });

  it("offers the way to the cadet panel to a staff account that plays, and the way to sign up to one that may, and nothing when «Staff como cadetes» is off", async () => {
    guards.teamPlayState.mockResolvedValue("play");
    const first = render(await StaffHomePage());
    expect(guards.teamPlayState).toHaveBeenCalledWith("staff", "s1");
    expect(screen.getByRole("link", { name: copy.teamPlay.toCadet.open })).toHaveAttribute("href", "/dashboard");
    first.unmount();

    guards.teamPlayState.mockResolvedValue("join");
    const second = render(await StaffHomePage());
    expect(screen.getByRole("link", { name: copy.teamPlay.join.open })).toHaveAttribute("href", "/onboarding");
    second.unmount();

    guards.teamPlayState.mockResolvedValue("off");
    render(await StaffHomePage());
    expect(screen.queryByRole("link", { name: copy.teamPlay.toCadet.open })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: copy.teamPlay.join.open })).not.toBeInTheDocument();
  });

  it("does not read anything when the guard stops the request", async () => {
    guards.requireRole.mockRejectedValue(new Error("not-found"));

    await expect(StaffHomePage()).rejects.toThrow("not-found");
    expect(server.listServePoints).not.toHaveBeenCalled();
  });

  it("groups the stations by kind (entrance, catering, stand), each with its count and a link to scan there", async () => {
    render(await StaffHomePage());

    const groups = screen.getByRole("group", { name: copy.staff.listLabel });
    const links = within(groups).getAllByRole("link", { name: copy.staff.serve });
    expect(links.map((link) => link.getAttribute("href"))).toEqual(["/staff/serve/entrance-main", "/staff/serve/lunch-1", "/staff/serve/coffee-1", "/staff/serve/stand-cloud"]);
    // The ticket change has no card of its own while an entrance is open: it is a button inside the entrance's card.
    expect(screen.getAllByRole("heading", { level: 2 }).map((heading) => heading.textContent)).toEqual([copy.staff.kinds.entrance, copy.staff.kinds.catering, copy.staff.kinds.stand]);
    const catering = screen.getByRole("region", { name: copy.staff.kinds.catering });
    expect(within(catering).getByText("120")).toBeInTheDocument();
    // A count that could not be read is left out instead of showing a made-up number.
    expect(within(catering).getAllByText(copy.staff.counterLabel.catering)).toHaveLength(1);
    expect(within(screen.getByRole("region", { name: copy.staff.kinds.entrance })).getByText("80")).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: copy.staff.kinds.entrance })).getByText(copy.staff.counterLabel.entrance)).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: copy.staff.kinds.stand })).getByText("12")).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: copy.staff.kinds.stand })).getByText(copy.staff.counterLabel.stand)).toBeInTheDocument();
  });

  it("puts the code for a screen in the menu of the entrances and the stands, each with its own label, and gives a meal no menu", async () => {
    render(await StaffHomePage());

    await openMenu("Entrada principal");
    expect(await screen.findByRole("menuitem", { name: copy.staff.showEntranceQr })).toHaveAttribute("href", "/staff/qr/entrance-main");
    await userEvent.keyboard("{Escape}");

    await openMenu("Stand Cloud");
    expect(await screen.findByRole("menuitem", { name: copy.staff.showStandQr })).toHaveAttribute("href", "/staff/qr/stand-cloud");
    await userEvent.keyboard("{Escape}");

    // A meal has nothing but its scanner: no code on a screen and no ticket change.
    expect(screen.queryByRole("button", { name: `${copy.staff.moreActions}: Almuerzo` })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: `${copy.staff.moreActions}: Coffee break` })).not.toBeInTheDocument();
  });

  it("lists the stations with the ones an admin limited the staff member to", async () => {
    const permissions = await import("@/app-shell/permissions.server");
    vi.spyOn(permissions, "staffCheckpoints").mockResolvedValueOnce(["stand-cloud"]);

    await StaffHomePage();

    expect(server.listServePoints).toHaveBeenCalledWith({ marker: "deps" }, { uid: "s1", role: "staff", kinds: ["entrance", "catering", "stand"], checkpointIds: ["stand-cloud"] });
  });

  it("offers «Cambiar entrada», for the staff to set a cadet's ticket, even when there is no station", async () => {
    server.listServePoints.mockResolvedValue({ ok: true, value: [] });

    render(await StaffHomePage());

    expect(screen.getByRole("link", { name: copy.staff.tickets.card.title })).toHaveAttribute("href", "/staff/entradas");
  });

  it("puts «Cambiar entrada» in the check-in card's menu, and not in a card of its own, while an entrance is open", async () => {
    render(await StaffHomePage());

    await openMenu("Entrada principal");
    expect(await screen.findByRole("menuitem", { name: copy.staff.tickets.card.title })).toHaveAttribute("href", "/staff/entradas");
    expect(screen.queryByRole("heading", { level: 2, name: copy.staff.tickets.card.title })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: copy.staff.tickets.card.title })).not.toBeInTheDocument();
  });

  it("gives every open entrance its own «Cambiar entrada» button, all to the same screen", async () => {
    server.listServePoints.mockResolvedValue({
      ok: true,
      value: [
        { id: "door-a", kind: "entrance", name: "Puerta A", servedCount: 1 },
        { id: "door-b", kind: "entrance", name: "Puerta B", servedCount: 2 },
      ],
    });

    render(await StaffHomePage());

    for (const door of ["Puerta A", "Puerta B"]) {
      await openMenu(door);
      expect(await screen.findByRole("menuitem", { name: copy.staff.tickets.card.title })).toHaveAttribute("href", "/staff/entradas");
      await userEvent.keyboard("{Escape}");
    }
  });

  it("keeps the card at the bottom when there is no open entrance", async () => {
    server.listServePoints.mockResolvedValue({ ok: true, value: [{ id: "lunch-1", kind: "catering", name: "Almuerzo", servedCount: 1 }] });

    render(await StaffHomePage());

    expect(screen.getByRole("heading", { level: 2, name: copy.staff.tickets.card.title })).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: copy.staff.kinds.catering })).queryByRole("link", { name: copy.staff.tickets.card.title })).not.toBeInTheDocument();
  });

  it("leaves «Cambiar entrada» out of the entrance's menu for staff an organizer limited to no station", async () => {
    permissions.staffCheckpoints.mockResolvedValue([]);

    render(await StaffHomePage());

    await openMenu("Entrada principal");
    expect(await screen.findByRole("menuitem", { name: copy.staff.showEntranceQr })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: copy.staff.tickets.card.title })).not.toBeInTheDocument();
  });

  it("leaves the card out for staff an organizer limited to no station, who cannot change tickets either", async () => {
    server.listServePoints.mockResolvedValue({ ok: true, value: [] });
    permissions.staffCheckpoints.mockResolvedValue([]);

    render(await StaffHomePage());

    expect(screen.queryByRole("link", { name: copy.staff.tickets.card.title })).not.toBeInTheDocument();
  });

  it("leaves out a kind with no open station", async () => {
    server.listServePoints.mockResolvedValue({ ok: true, value: [{ id: "lunch-1", kind: "catering", name: "Almuerzo", servedCount: 1 }] });

    render(await StaffHomePage());

    expect(screen.getAllByRole("heading", { level: 2 }).map((heading) => heading.textContent)).toEqual([copy.staff.kinds.catering, copy.staff.tickets.card.title]);
  });

  it("says so when there is nothing to serve", async () => {
    server.listServePoints.mockResolvedValue({ ok: true, value: [] });

    render(await StaffHomePage());

    expect(screen.getByText(copy.staff.empty)).toBeInTheDocument();
  });

  it("surfaces a failed read through the error boundary instead of claiming there is nothing to serve", async () => {
    server.listServePoints.mockResolvedValue({ ok: false, error: { code: "unknown" } });

    await expect(StaffHomePage()).rejects.toThrow("Could not read the stations");
  });

  it("has no detectable accessibility violations", async () => {
    const { container } = render(await StaffHomePage());

    expect((await axe(container)).violations).toEqual([]);
  });
});

describe("staff home page puesto details", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    guards.requireRole.mockResolvedValue({ uid: "s1", role: "staff", displayName: null, photoUrl: null });
  });

  it("shows each puesto's image and description on its card", async () => {
    server.listServePoints.mockResolvedValue({
      ok: true,
      value: [
        { id: "louis-3d", kind: "stand", name: "Louis 3D", description: "Impresión 3D en vivo", image: "/media/logo.webp", servedCount: 4 },
        { id: "lunch-1", kind: "catering", name: "Almuerzo", description: "", image: null, servedCount: 1 },
      ],
    });

    const { container } = render(await StaffHomePage());

    expect(within(screen.getByRole("region", { name: copy.staff.kinds.stand })).getByText("Impresión 3D en vivo")).toBeInTheDocument();
    expect(container.querySelectorAll("img")).toHaveLength(1);
    expect(container.querySelector('img[src="/media/logo.webp"]')).not.toBeNull();
  });
});
