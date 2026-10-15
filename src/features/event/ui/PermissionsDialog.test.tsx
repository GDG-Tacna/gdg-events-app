// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { copy } from "@/shared/copy/es";
import { axe } from "@/test-utils/axe";
import { DEFAULT_PERMISSIONS } from "../domain/permissions";
import type { SavePermissionsAction } from "./actions";
import { PermissionsDialog } from "./PermissionsDialog";

const t = copy.admin.events.permissions;
const TARGET = {
  id: "meetup-nov",
  name: "Meetup noviembre",
  permissions: { organizer: { ...DEFAULT_PERMISSIONS.organizer, raffle: "none" as const }, staffStations: ["entrance" as const, "stand" as const] },
};

function setup(save: SavePermissionsAction = vi.fn<SavePermissionsAction>(async () => ({ ok: true }))) {
  const onSaved = vi.fn();
  render(<PermissionsDialog target={TARGET} save={save} onClose={vi.fn()} onSaved={onSaved} />);
  return { save, onSaved, user: userEvent.setup(), dialog: screen.getByRole("dialog", { name: t.title }) };
}

describe("PermissionsDialog", () => {
  it("shows each section's level and the stations staff operate", () => {
    const { dialog } = setup();

    expect(within(within(dialog).getByRole("group", { name: t.sections.raffle })).getByRole("radio", { name: t.levels.none })).toBeChecked();
    expect(within(within(dialog).getByRole("group", { name: t.sections.missions })).getByRole("radio", { name: t.levels.edit })).toBeChecked();
    expect(within(dialog).getByRole("checkbox", { name: t.stations.catering })).not.toBeChecked();
  });

  it("saves the levels chosen and the stations, and reports it", async () => {
    const { save, onSaved, user, dialog } = setup();

    await user.click(within(within(dialog).getByRole("group", { name: t.sections.economy })).getByRole("radio", { name: t.levels.view }));
    await user.click(within(dialog).getByRole("checkbox", { name: t.stations.catering }));
    await user.click(within(dialog).getByRole("button", { name: t.save }));

    expect(save).toHaveBeenCalledWith({
      eventId: "meetup-nov",
      organizer: expect.objectContaining({ economy: "view", raffle: "none", missions: "edit" }),
      staffStations: ["entrance", "catering", "stand"],
    });
    expect(onSaved).toHaveBeenCalledWith("Permisos de «Meetup noviembre» guardados.");
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
