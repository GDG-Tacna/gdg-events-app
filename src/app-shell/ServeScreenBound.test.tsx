// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { copy } from "@/shared/copy/es";

vi.mock("@/app-shell/checkpoints/serve-attendee.action", () => ({ serveAttendeeAction: vi.fn() }));

vi.mock("@/features/scanner", async (importOriginal) => {
  const { fakeQrCamera } = await import("@/test-utils/fake-qr-camera");
  return { ...(await importOriginal<typeof import("@/features/scanner")>()), QrCodeCamera: fakeQrCamera().camera };
});

const { ServeScreenBound } = await import("./ServeScreenBound");

describe("ServeScreenBound", () => {
  it("shows the station's screen with the real camera, its kind's counter, and a way back to the list", () => {
    render(<ServeScreenBound checkpointId="stand-cloud" kind="stand" name="Stand Cloud" initialCount={7} />);

    expect(screen.getByRole("heading", { level: 1, name: "Stand Cloud" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: copy.scanner.videoLabel })).toBeInTheDocument();
    expect(screen.getByText(copy.staff.counterLabel.stand)).toBeInTheDocument();
    expect(screen.getByText("7")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: copy.staff.back })).toHaveAttribute("href", "/staff");
  });

  const STATIONS = [
    { id: "entrada", name: "Entrada principal" },
    { id: "coffee", name: "Coffee break" },
    { id: "almuerzo", name: "Almuerzo" },
  ];

  it("shows a row to switch to the other open puestos (the staff's scanners by default), marking the current one", () => {
    render(<ServeScreenBound checkpointId="coffee" kind="catering" name="Coffee break" initialCount={96} stations={STATIONS} />);

    const row = screen.getByRole("navigation", { name: copy.staff.listLabel });
    expect(within(row).getAllByRole("link")).toHaveLength(3);
    expect(within(row).getByRole("link", { name: "Entrada principal" })).toHaveAttribute("href", "/staff/serve/entrada");
    expect(within(row).getByRole("link", { name: "Coffee break" })).toHaveAttribute("aria-current", "page");
    expect(within(row).getByRole("link", { name: "Almuerzo" })).not.toHaveAttribute("aria-current");
  });

  it("points the row at another route when it is given one, and hides it with fewer than two puestos or without the list", () => {
    const { unmount } = render(<ServeScreenBound checkpointId="coffee" kind="catering" name="Coffee break" initialCount={0} stations={STATIONS} stationBase="/admin/puestos/escanear" />);
    expect(screen.getByRole("link", { name: "Almuerzo" })).toHaveAttribute("href", "/admin/puestos/escanear/almuerzo");
    unmount();

    const alone = render(<ServeScreenBound checkpointId="coffee" kind="catering" name="Coffee break" initialCount={0} stations={[STATIONS[1]!]} />);
    expect(screen.queryByRole("navigation", { name: copy.staff.listLabel })).not.toBeInTheDocument();
    alone.unmount();

    render(<ServeScreenBound checkpointId="coffee" kind="catering" name="Coffee break" initialCount={0} />);
    expect(screen.queryByRole("navigation", { name: copy.staff.listLabel })).not.toBeInTheDocument();
  });

  it("can send the way back somewhere else, with its own label (the admin's scanner goes back to Puestos)", () => {
    render(<ServeScreenBound checkpointId="lunch-1" kind="catering" name="Almuerzo" initialCount={0} backHref="/admin/puestos" backLabel={copy.admin.checkpoints.scanBack} />);

    expect(screen.getByRole("link", { name: copy.admin.checkpoints.scanBack })).toHaveAttribute("href", "/admin/puestos");
    expect(screen.queryByRole("link", { name: copy.staff.back })).not.toBeInTheDocument();
  });
});
