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

describe("AvatarEditor", () => {
  beforeEach(() => vi.clearAllMocks());

  it("starts from the alias's look and saves the choices made", async () => {
    const { save, user } = renderEditor();

    expect(screen.getByRole("img", { name: t.previewLabel })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: t.hairStyles[ORIGINAL.hairStyle] })).toBeChecked();
    await user.click(screen.getByRole("radio", { name: t.hairStyles.curly }));
    await user.click(screen.getByRole("radio", { name: t.beards.mustache }));
    await user.click(screen.getByRole("radio", { name: t.glasses.shades }));
    await user.click(screen.getByRole("radio", { name: "Azul marino" }));
    await user.click(screen.getByRole("radio", { name: "Tono 6" }));
    await user.click(screen.getByRole("button", { name: t.save }));

    expect(save).toHaveBeenCalledWith({ look: { ...ORIGINAL, hairStyle: "curly", beard: "mustache", glasses: "shades", suit: 2, skin: 5 } });
    expect(await screen.findByText(t.saved)).toHaveFocus();
    expect(router.refresh).toHaveBeenCalled();
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
