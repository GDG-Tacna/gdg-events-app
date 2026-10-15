// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { copy } from "@/shared/copy/es";
import { axe } from "@/test-utils/axe";
import { DEFAULT_ECONOMY } from "../domain/settings";
import { EconomySettingsView, type SaveEconomyAction } from "./EconomySettingsView";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

const e = copy.admin.economy;
const type = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

describe("EconomySettingsView", () => {
  beforeEach(() => refresh.mockReset());

  it("shows the edition's settings and says when they are the defaults", () => {
    render(<EconomySettingsView settings={DEFAULT_ECONOMY} eventId="devfest-2026" isDefault save={vi.fn()} />);

    expect(screen.getByRole("checkbox", { name: new RegExp(e.creditsEnabled) })).toBeChecked();
    expect(screen.getByLabelText(copy.missions.types.stand)).toHaveValue("10");
    expect(screen.getByLabelText(e.talkCredits)).toHaveValue("10");
    expect(screen.getByLabelText(e.squadRatio)).toHaveValue("1");
    expect(screen.getByText(e.defaultNote)).toBeInTheDocument();
    expect(screen.getByText("Se aplica a la edición devfest-2026")).toBeInTheDocument();
  });

  it("saves the values typed, accepting a decimal comma in the ratio", async () => {
    const save = vi.fn<SaveEconomyAction>(async () => ({ ok: true }));
    render(<EconomySettingsView settings={DEFAULT_ECONOMY} eventId="devfest-2026" isDefault={false} save={save} />);

    type(copy.missions.types.quiz, "8x");
    type(e.talkCredits, "15");
    type(e.squadRatio, "0,5");
    type(e.contactXp, "30");
    type(e.contactCredits, "2");
    type(e.contactCap, "25");
    fireEvent.click(screen.getByRole("button", { name: e.save }));

    expect(await screen.findByRole("status")).toHaveTextContent(e.saved);
    expect(save).toHaveBeenCalledWith({ ...DEFAULT_ECONOMY, missionCredits: { ...DEFAULT_ECONOMY.missionCredits, quiz: 8 }, talkCredits: 15, squadRatio: 0.5, contactXp: 30, contactCredits: 2, contactCap: 25 });
    expect(refresh).toHaveBeenCalled();
  });

  it("switches a currency off, which disables its values", () => {
    const save = vi.fn<SaveEconomyAction>(async () => ({ ok: true }));
    render(<EconomySettingsView settings={DEFAULT_ECONOMY} eventId="devfest-2026" isDefault={false} save={save} />);

    fireEvent.click(screen.getByRole("checkbox", { name: new RegExp(e.creditsEnabled) }));
    fireEvent.click(screen.getByRole("checkbox", { name: new RegExp(e.squadEnabled) }));

    expect(screen.getByLabelText(e.talkCredits)).toBeDisabled();
    expect(screen.getByLabelText(copy.missions.types.talk)).toBeDisabled();
    expect(screen.getByLabelText(e.squadRatio)).toBeDisabled();
    // Contacts still pay XP without credits.
    expect(screen.getByLabelText(e.contactCredits)).toBeDisabled();
    expect(screen.getByLabelText(e.contactXp)).toBeEnabled();
  });

  it("will not send values out of range, and explains a refusal or a failure", async () => {
    const save = vi.fn<SaveEconomyAction>().mockResolvedValueOnce({ ok: false, code: "forbidden" }).mockRejectedValueOnce(new Error("x"));
    render(<EconomySettingsView settings={DEFAULT_ECONOMY} eventId="devfest-2026" isDefault={false} save={save} />);

    type(e.talkCredits, "");
    fireEvent.click(screen.getByRole("button", { name: e.save }));
    expect(screen.getByRole("alert")).toHaveTextContent(e.errors["invalid-settings"]);
    expect(save).not.toHaveBeenCalled();

    type(e.talkCredits, "10");
    type(e.contactCap, "");
    fireEvent.click(screen.getByRole("button", { name: e.save }));
    expect(save).not.toHaveBeenCalled();
    type(e.contactCap, "10");
    fireEvent.click(screen.getByRole("button", { name: e.save }));
    expect(await screen.findByRole("alert")).toHaveTextContent(e.errors.forbidden);
    fireEvent.click(screen.getByRole("button", { name: e.save }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(e.errors.unknown));
  });

  it("has no detectable accessibility violations", async () => {
    const { container } = render(<EconomySettingsView settings={DEFAULT_ECONOMY} eventId="devfest-2026" isDefault save={vi.fn()} />);
    expect((await axe(container)).violations).toEqual([]);
  });
});
