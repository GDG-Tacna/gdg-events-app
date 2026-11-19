// @vitest-environment jsdom
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { copy } from "@/shared/copy/es";
import { axe } from "@/test-utils/axe";
import { fakeQrCamera } from "@/test-utils/fake-qr-camera";
import type { ChangeCadetTicketAction, LookupTicketAction } from "./actions";
import { ChangeTicketScreen } from "./ChangeTicketScreen";

const t = copy.staff.tickets;

function setup(overrides: { lookup?: LookupTicketAction; change?: ChangeCadetTicketAction } = {}) {
  const fake = fakeQrCamera();
  const lookup = overrides.lookup ?? vi.fn<LookupTicketAction>(async () => ({ ok: true, uid: "cadet-0001", alias: "Nova_7", ticket: "general" }));
  const change = overrides.change ?? vi.fn<ChangeCadetTicketAction>(async () => ({ ok: true }));
  const view = render(<ChangeTicketScreen camera={fake.camera} lookup={lookup} change={change} backHref="/staff" />);
  return { ...view, ...fake, lookup, change, user: userEvent.setup() };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ChangeTicketScreen", () => {
  it("asks for the cadet's QR and offers the way back", () => {
    setup();

    expect(screen.getByRole("heading", { level: 1, name: t.title })).toBeInTheDocument();
    expect(screen.getByText(t.hint)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: t.back })).toHaveAttribute("href", "/staff");
  });

  it("sends the scanned pass, and shows the cadet with their current ticket", async () => {
    const s = setup();

    await s.see("devfest:at:pass");

    expect(s.lookup).toHaveBeenCalledWith({ payload: "devfest:at:pass" });
    expect(await screen.findByText("Nova_7")).toBeInTheDocument();
    expect(screen.getAllByText("Entrada General").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: /^General/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Pro/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Premium/ })).toBeInTheDocument();
  });

  it("changes the ticket after the staff picks one and confirms, and says so", async () => {
    const s = setup();
    await s.see("devfest:at:pass");
    await screen.findByText("Nova_7");

    expect(screen.getByRole("button", { name: t.pickLegend })).toBeDisabled();
    await s.user.click(screen.getByRole("button", { name: /^Premium/ }));
    await s.user.click(screen.getByRole("button", { name: "Poner entrada Premium" }));

    expect(s.change).toHaveBeenCalledWith({ uid: "cadet-0001", type: "premium" });
    expect(await screen.findByText("Nova_7 ahora tiene entrada Premium.")).toBeInTheDocument();
    expect(screen.getAllByText("Entrada Premium").length).toBeGreaterThan(0);
  });

  it("says when the cadet already had that ticket", async () => {
    const s = setup({ lookup: vi.fn<LookupTicketAction>(async () => ({ ok: true, uid: "cadet-0001", alias: "Nova_7", ticket: "pro" })) });
    await s.see("devfest:at:pass");
    await screen.findByText("Nova_7");

    await s.user.click(screen.getByRole("button", { name: /^Pro/ }));
    await s.user.click(screen.getByRole("button", { name: "Poner entrada Pro" }));

    expect(await screen.findByText("Nova_7 ya tenía entrada Pro.")).toBeInTheDocument();
  });

  it("shows why a change failed and lets the staff try again", async () => {
    const change = vi.fn<ChangeCadetTicketAction>(async () => ({ ok: false, code: "forbidden" }));
    const s = setup({ change });
    await s.see("devfest:at:pass");
    await screen.findByText("Nova_7");

    await s.user.click(screen.getByRole("button", { name: /^Pro/ }));
    await s.user.click(screen.getByRole("button", { name: "Poner entrada Pro" }));

    expect(await screen.findByText(copy.tickets.errors.forbidden)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Poner entrada Pro" })).toBeEnabled();
  });

  it("says why a scan was refused, and goes back to the camera for the next cadet", async () => {
    const lookup = vi.fn<LookupTicketAction>(async () => ({ ok: false, code: "expired-code" }));
    const s = setup({ lookup });

    await s.see("devfest:at:pass");

    expect(await screen.findByText(copy.tickets.errors["expired-code"])).toBeInTheDocument();
    await s.user.click(screen.getByRole("button", { name: t.cancel }));
    expect(screen.queryByText(copy.tickets.errors["expired-code"])).not.toBeInTheDocument();
    expect(s.paused()).toBe(false);
  });

  it("scans the next cadet after one", async () => {
    const s = setup();
    await s.see("devfest:at:pass");
    await screen.findByText("Nova_7");

    await act(async () => {
      await s.user.click(screen.getByRole("button", { name: t.cancel }));
    });

    expect(screen.queryByText("Nova_7")).not.toBeInTheDocument();
    expect(s.paused()).toBe(false);
  });

  it("has no detectable accessibility violations", async () => {
    const s = setup();
    await s.see("devfest:at:pass");
    await screen.findByText("Nova_7");

    expect((await axe(s.container)).violations).toEqual([]);
  });
});
