// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { copy } from "@/shared/copy/es";
import { axe } from "@/test-utils/axe";
import type { CopyEditionAction } from "./actions";
import { CopyEditionDialog } from "./CopyEditionDialog";

const t = copy.admin.events.copy;
const TARGET = { id: "meetup-nov", name: "Meetup noviembre" };
const SOURCES = [{ id: "devfest-2026", name: "DevFest Tacna 2026" }];

function setup(copyContent: CopyEditionAction = vi.fn<CopyEditionAction>(async () => ({ ok: true, parts: ["squads"], documents: 4 }))) {
  const onCopied = vi.fn();
  render(<CopyEditionDialog target={TARGET} sources={SOURCES} copyContent={copyContent} onClose={vi.fn()} onCopied={onCopied} />);
  return { copyContent, onCopied, user: userEvent.setup(), dialog: screen.getByRole("dialog", { name: t.title }) };
}

describe("CopyEditionDialog", () => {
  it("includes what a chosen part needs, says why, and copies them all from the chosen edition", async () => {
    const { copyContent, onCopied, user, dialog } = setup();

    await user.selectOptions(within(dialog).getByLabelText(t.source), "devfest-2026");
    await user.click(within(dialog).getByRole("checkbox", { name: t.parts.missions }));

    const map = within(dialog).getByRole("checkbox", { name: t.parts.map });
    expect(map).toBeChecked();
    expect(map).toBeDisabled();
    expect(map).toHaveAccessibleDescription("Se incluye porque lo usan: Misiones.");

    await user.click(within(dialog).getByRole("button", { name: t.submit }));
    expect(copyContent).toHaveBeenCalledWith({ from: "devfest-2026", to: "meetup-nov", parts: ["map", "checkpoints", "speakers", "talks", "missions"] });
    expect(onCopied).toHaveBeenCalledWith("Listo: se copiaron 4 elementos de «DevFest Tacna 2026».");
  });

  it("names the parts this edition already has when the server refuses", async () => {
    const { user, dialog } = setup(async () => ({ ok: false, code: "not-empty", parts: ["map", "talks"] }));

    await user.selectOptions(within(dialog).getByLabelText(t.source), "devfest-2026");
    await user.click(within(dialog).getByRole("checkbox", { name: t.parts.missions }));
    await user.click(within(dialog).getByRole("button", { name: t.submit }));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Este evento ya tiene: Mapa y plano del local, Charlas.");
  });

  it("asks for a source and at least one part before calling the server", async () => {
    const { copyContent, user, dialog } = setup();

    await user.click(within(dialog).getByRole("button", { name: t.submit }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(t.errors["same-edition"]);
    await user.selectOptions(within(dialog).getByLabelText(t.source), "devfest-2026");
    await user.click(within(dialog).getByRole("button", { name: t.submit }));
    expect(within(dialog).getByRole("alert")).toHaveTextContent(t.errors["invalid-parts"]);
    expect(copyContent).not.toHaveBeenCalled();
  });

  it("has no detectable accessibility violations", async () => {
    setup();
    expect((await axe(document.body)).violations).toEqual([]);
  });
});
