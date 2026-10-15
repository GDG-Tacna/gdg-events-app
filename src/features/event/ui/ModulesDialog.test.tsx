// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { copy } from "@/shared/copy/es";
import { axe } from "@/test-utils/axe";
import type { SaveModulesAction } from "./actions";
import { ModulesDialog } from "./ModulesDialog";

const t = copy.admin.events.modules;
const TARGET = { id: "meetup-nov", name: "Meetup noviembre", off: ["raffle" as const] };

function setup(save: SaveModulesAction = vi.fn<SaveModulesAction>(async () => ({ ok: true }))) {
  const onSaved = vi.fn();
  render(<ModulesDialog target={TARGET} save={save} onClose={vi.fn()} onSaved={onSaved} />);
  return { save, onSaved, user: userEvent.setup(), dialog: screen.getByRole("dialog", { name: t.title }) };
}

describe("ModulesDialog", () => {
  it("shows what the edition has on, and switching Misiones off takes what needs it too, with the reason", async () => {
    const { user, dialog } = setup();
    const toggle = (name: string) => within(dialog).getByRole("switch", { name });

    expect(toggle(t.names.raffle)).not.toBeChecked();
    expect(toggle(t.names.missions)).toBeChecked();
    await user.click(toggle(t.names.missions));

    expect(toggle(t.names.minigames)).not.toBeChecked();
    expect(toggle(t.names.minigames)).toBeDisabled();
    expect(toggle(t.names.minigames)).toHaveAccessibleDescription("Se apaga con Misiones.");
  });

  it("saves the modules switched off and reports it", async () => {
    const { save, onSaved, user, dialog } = setup();

    await user.click(within(dialog).getByRole("switch", { name: t.names.network }));
    await user.click(within(dialog).getByRole("switch", { name: t.names.raffle }));
    await user.click(within(dialog).getByRole("button", { name: t.save }));

    expect(save).toHaveBeenCalledWith({ eventId: "meetup-nov", off: ["network"] });
    expect(onSaved).toHaveBeenCalledWith("Módulos de «Meetup noviembre» guardados.");
  });

  it("shows the reason when saving is refused", async () => {
    const { user, dialog } = setup(async () => ({ ok: false, code: "forbidden" }));

    await user.click(within(dialog).getByRole("button", { name: t.save }));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent(t.errors.forbidden);
  });

  it("has no detectable accessibility violations", async () => {
    setup();
    expect((await axe(document.body)).violations).toEqual([]);
  });
});
