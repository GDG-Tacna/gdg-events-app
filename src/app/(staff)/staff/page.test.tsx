// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { copy } from "@/shared/copy/es";
import { axe } from "@/test-utils/axe";

vi.mock("server-only", () => ({}));
vi.mock("@/app-shell/composition/checkpoints.server", () => ({ serveDeps: { marker: "deps" } }));

const guards = { requireRole: vi.fn() };
vi.mock("@/app-shell/guards", () => guards);

const server = { listServePoints: vi.fn() };
vi.mock("@/features/checkpoints/server", () => server);

const { default: StaffHomePage } = await import("./page");

describe("staff home page", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    guards.requireRole.mockResolvedValue({ uid: "s1", role: "staff", displayName: null, photoUrl: null });
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
    ]);
    const catering = screen.getByRole("region", { name: copy.staff.kinds.catering });
    expect(within(catering).getByText("120 raciones entregadas")).toBeInTheDocument();
    // A count that could not be read is left out instead of showing a made-up number.
    expect(within(catering).getAllByText(/raciones entregadas/)).toHaveLength(1);
    expect(within(screen.getByRole("region", { name: copy.staff.kinds.entrance })).getByText("80 ingresos")).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: copy.staff.kinds.stand })).getByText("12 visitas")).toBeInTheDocument();
  });

  it("leaves out a kind with no open station", async () => {
    server.listServePoints.mockResolvedValue({ ok: true, value: [{ id: "lunch-1", kind: "catering", name: "Almuerzo", servedCount: 1 }] });

    render(await StaffHomePage());

    expect(screen.getAllByRole("heading", { level: 2 }).map((heading) => heading.textContent)).toEqual([copy.staff.kinds.catering]);
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
