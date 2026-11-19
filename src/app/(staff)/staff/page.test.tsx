// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { copy } from "@/shared/copy/es";
import { axe } from "@/test-utils/axe";

vi.mock("server-only", () => ({}));
vi.mock("@/app-shell/composition/checkpoints.server", () => ({ serveDeps: { marker: "deps" } }));

const guards = { requireRole: vi.fn() };
vi.mock("@/app-shell/guards", () => guards);
const permissions = vi.hoisted(() => ({ staffStations: vi.fn(), staffCheckpoints: vi.fn() }));
vi.mock("@/app-shell/permissions.server", () => permissions);

const server = { listServePoints: vi.fn() };
vi.mock("@/features/checkpoints/server", () => server);

const { default: StaffHomePage } = await import("./page");

describe("staff home page", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    guards.requireRole.mockResolvedValue({ uid: "s1", role: "staff", displayName: null, photoUrl: null });
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
    expect(screen.getAllByRole("heading", { level: 2 }).map((heading) => heading.textContent)).toEqual([
      copy.staff.kinds.entrance,
      copy.staff.kinds.catering,
      copy.staff.kinds.stand,
      copy.staff.tickets.card.title,
    ]);
    const catering = screen.getByRole("region", { name: copy.staff.kinds.catering });
    expect(within(catering).getByText("120 raciones entregadas")).toBeInTheDocument();
    // A count that could not be read is left out instead of showing a made-up number.
    expect(within(catering).getAllByText(/raciones entregadas/)).toHaveLength(1);
    expect(within(screen.getByRole("region", { name: copy.staff.kinds.entrance })).getByText("80 ingresos")).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: copy.staff.kinds.stand })).getByText("12 visitas")).toBeInTheDocument();
  });

  it("offers the code for a screen on the entrances and the stands, each with its own label, never on a meal", async () => {
    render(await StaffHomePage());

    const door = screen.getAllByRole("link", { name: copy.staff.showEntranceQr });
    expect(door.map((link) => link.getAttribute("href"))).toEqual(["/staff/qr/entrance-main"]);
    const stand = screen.getAllByRole("link", { name: copy.staff.showStandQr });
    expect(stand.map((link) => link.getAttribute("href"))).toEqual(["/staff/qr/stand-cloud"]);
    expect(within(screen.getByRole("region", { name: copy.staff.kinds.catering })).queryByRole("link", { name: /QR/ })).not.toBeInTheDocument();
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
