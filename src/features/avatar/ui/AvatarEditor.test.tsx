// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { copy } from "@/shared/copy/es";
import { lookFromSeed, type AvatarLook } from "@/shared/ui";
import { axe } from "@/test-utils/axe";
import type { ResetAvatarAction, SaveAvatarAction } from "./actions";
import { AvatarEditor } from "./AvatarEditor";

const router = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

const t = copy.avatar;
const ORIGINAL = lookFromSeed("Nova_7");

function renderEditor(chosen: AvatarLook | null = null) {
  const save = vi.fn<SaveAvatarAction>(async () => ({ ok: true }));
  const reset = vi.fn<ResetAvatarAction>(async () => ({ ok: true }));
  const view = render(<AvatarEditor alias="Nova_7" chosen={chosen} save={save} reset={reset} backHref="/dashboard" />);
  return { save, reset, view, user: userEvent.setup() };
}

const openTab = (user: ReturnType<typeof userEvent.setup>, name: keyof typeof t.tabs) => user.click(screen.getByRole("tab", { name: t.tabs[name] }));

describe("AvatarEditor", () => {
  beforeEach(() => vi.clearAllMocks());

  it("starts from the alias's look and saves the choices made across the tabs", async () => {
    const { save, user } = renderEditor();

    expect(screen.getByRole("img", { name: t.previewLabel })).toBeInTheDocument();
    // Face: skin, beard and glasses.
    await user.click(screen.getByRole("radio", { name: t.beards.mustache }));
    await user.click(screen.getByRole("radio", { name: t.glasses.shades }));
    await user.click(screen.getByRole("radio", { name: "Tono 6" }));
    await openTab(user, "hair");
    expect(screen.getByRole("radio", { name: t.hairStyles[ORIGINAL.hairStyle] })).toBeChecked();
    await user.click(screen.getByRole("radio", { name: t.hairStyles.curly }));
    await openTab(user, "suit");
    await user.click(screen.getByRole("radio", { name: "Azul marino" }));
    await user.click(screen.getByRole("button", { name: t.save }));

    expect(save).toHaveBeenCalledWith({ look: { ...ORIGINAL, hairStyle: "curly", beard: "mustache", glasses: "shades", suit: 2, skin: 5 } });
    expect(await screen.findByText(t.saved)).toHaveFocus();
    expect(router.refresh).toHaveBeenCalled();
  });

  it("shows one group of parts at a time, in tabs, with the current one selected", async () => {
    const { user } = renderEditor();

    expect(screen.getByRole("tab", { name: t.tabs.face })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("group", { name: t.groups.beard })).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: t.groups.hairStyle })).not.toBeInTheDocument();

    await openTab(user, "hair");

    expect(screen.getByRole("tab", { name: t.tabs.hair })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("group", { name: t.groups.hairStyle })).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: t.groups.beard })).not.toBeInTheDocument();
  });

  it("lets the helmet come off, so the face and the hairstyle show, and then the helmet color cannot be chosen", async () => {
    const { save, user } = renderEditor();

    await openTab(user, "helmet");
    expect(screen.getByRole("radio", { name: t.helmetState.on })).toBeChecked();
    expect(screen.getByRole("radio", { name: t.helmets[0] })).toBeEnabled();

    await user.click(screen.getByRole("radio", { name: t.helmetState.off }));

    expect(screen.getByRole("radio", { name: t.helmetState.off })).toBeChecked();
    expect(screen.getByRole("radio", { name: t.helmets[0] })).toBeDisabled();
    expect(screen.getByText(t.helmetOffHint)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: t.save }));
    expect(save).toHaveBeenCalledWith({ look: { ...ORIGINAL, helmetOn: false } });
  });

  it("undoes the last changes one by one, and has nothing to undo at the start", async () => {
    const { user } = renderEditor();
    expect(screen.getByRole("button", { name: t.undo })).toBeDisabled();

    await user.click(screen.getByRole("radio", { name: t.beards.beard }));
    await user.click(screen.getByRole("radio", { name: t.glasses.round }));
    expect(screen.getByRole("radio", { name: t.glasses.round })).toBeChecked();

    await user.click(screen.getByRole("button", { name: t.undo }));
    expect(screen.getByRole("radio", { name: t.glasses.none })).toBeChecked();
    expect(screen.getByRole("radio", { name: t.beards.beard })).toBeChecked();

    await user.click(screen.getByRole("button", { name: t.undo }));
    expect(screen.getByRole("radio", { name: t.beards.none })).toBeChecked();
    expect(screen.getByRole("button", { name: t.undo })).toBeDisabled();
  });

  it("says whether there is anything to save, and that all is saved after saving", async () => {
    const { user } = renderEditor();
    expect(screen.getByText(t.allSaved)).toBeInTheDocument();

    await user.click(screen.getByRole("radio", { name: t.beards.stubble }));
    expect(screen.getByText(t.unsaved)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: t.save }));
    expect(await screen.findByText(t.allSaved)).toBeInTheDocument();
    // Changing it back to what was saved before the change is a change from what is saved now.
    await user.click(screen.getByRole("radio", { name: t.beards.none }));
    expect(screen.getByText(t.unsaved)).toBeInTheDocument();
  });

  it("goes back to the original, forgetting the chosen look on the server", async () => {
    const chosen: AvatarLook = { ...ORIGINAL, beard: "beard", suit: 4 };
    const { reset, user } = renderEditor(chosen);

    expect(screen.getByRole("radio", { name: t.beards.beard })).toBeChecked();
    await user.click(screen.getByRole("button", { name: t.original }));

    await waitFor(() => expect(reset).toHaveBeenCalled());
    expect(screen.getByRole("radio", { name: t.beards.none })).toBeChecked();
    expect(await screen.findByText(t.restored)).toBeInTheDocument();
  });

  it("only goes back on screen when nothing was saved, and offers a random look", async () => {
    const { reset, user } = renderEditor();

    expect(screen.getByRole("button", { name: t.original })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: t.random }));
    await user.click(screen.getByRole("button", { name: t.original }));
    expect(reset).not.toHaveBeenCalled();
  });

  it("shows a refusal, and has no detectable accessibility violations", async () => {
    const { save, user, view } = renderEditor();
    save.mockResolvedValueOnce({ ok: false, code: "invalid-look" });

    await user.click(screen.getByRole("button", { name: t.save }));
    expect(await screen.findByRole("alert")).toHaveTextContent(t.errors["invalid-look"]);
    expect((await axe(view.container)).violations).toEqual([]);
  });
});
