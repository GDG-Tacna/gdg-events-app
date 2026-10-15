// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { copy } from "@/shared/copy/es";
import { axe } from "@/test-utils/axe";
import type { CreateSquadAction, SquadAdminActionResult, UpdateSquadAction } from "./admin-actions";
import type { UploadImageAction } from "@/features/media";
import { SquadForm } from "./SquadForm";

const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

const rows = Array.from({ length: 16 }, (_, y) => (y === 0 ? "a..............." : "................"));
const SQUAD = { id: "gemini", name: "Escuadrón Gemini", tagline: "Inteligencia que se adapta.", sprite: { rows, palette: { a: "#8b5cf6" } } };

const UPLOADED = "public/devfest-2026/squad-logo/0f8e2c1a-1111-4222-8333-944455551111.svg";
const upload = vi.fn<UploadImageAction>(async () => ({ ok: true, image: { path: UPLOADED, url: "https://cdn/logo.svg", width: 16, height: 16, format: "svg" } }));
const nameField = () => screen.getByLabelText(copy.admin.squads.form.nameLabel);
const taglineField = () => screen.getByLabelText(copy.admin.squads.form.taglineLabel);
const save = () => screen.getByRole("button", { name: copy.admin.squads.form.save });

/** Paints the top-left pixel through the editor, the way an admin would. */
function paintFirstPixel() {
  const grid = screen.getByRole("grid");
  grid.getBoundingClientRect = () => ({ left: 0, top: 0, width: 320, height: 320, right: 320, bottom: 320, x: 0, y: 0, toJSON: () => ({}) });
  fireEvent.pointerDown(grid, { clientX: 5, clientY: 5, pointerId: 1 });
  fireEvent.pointerUp(grid, { pointerId: 1 });
}

describe("SquadForm create", () => {
  beforeEach(() => vi.clearAllMocks());

  it("suggests the id from the name, without the word Escuadrón, and creates the squad with its logo", async () => {
    const create = vi.fn<CreateSquadAction>(async () => ({ ok: true }));
    render(<SquadForm mode="create" save={create} upload={upload} listHref="/admin/escuadrones" />);
    const user = userEvent.setup();

    await user.type(nameField(), "Escuadrón Android");
    expect(screen.getByLabelText(copy.admin.squads.form.idLabel)).toHaveValue("android");
    await user.type(taglineField(), "Robots verdes");
    paintFirstPixel();
    await user.click(save());

    expect(create).toHaveBeenCalledWith({
      id: "android",
      name: "Escuadrón Android",
      tagline: "Robots verdes",
      sprite: expect.objectContaining({ rows: expect.arrayContaining(["a..............."]) }),
    });
    expect(router.push).toHaveBeenCalledWith("/admin/escuadrones");
    expect(router.refresh).toHaveBeenCalled();
  });

  it("checks the same rules as the server before sending: an empty logo is not saved", async () => {
    const create = vi.fn<CreateSquadAction>();
    render(<SquadForm mode="create" save={create} upload={upload} listHref="/admin/escuadrones" />);
    const user = userEvent.setup();

    await user.type(nameField(), "Escuadrón Android");
    await user.type(taglineField(), "Robots verdes");
    await user.click(save());

    expect(create).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(copy.admin.squads.errors["invalid-logo"]);
  });

  it("lets an uploaded logo stand in for the drawing, and sends its path", async () => {
    const create = vi.fn<CreateSquadAction>(async (): Promise<SquadAdminActionResult> => ({ ok: true }));
    render(<SquadForm mode="create" save={create} upload={upload} listHref="/admin/escuadrones" />);
    const user = userEvent.setup();

    await user.type(nameField(), "Escuadrón Android");
    await user.type(taglineField(), "Robots verdes");
    fireEvent.change(screen.getByTestId("image-input-squad-logo"), { target: { files: [new File(["<svg/>"], "logo.svg", { type: "image/svg+xml" })] } });
    await screen.findByRole("img", { name: `Vista previa: ${copy.admin.squads.form.uploadedLogo}` });
    await user.click(save());

    expect(create).toHaveBeenCalledWith(expect.objectContaining({ id: "android", logoPath: UPLOADED }));
  });

  it("keeps a squad's uploaded logo when it is not touched, and removes it on request", async () => {
    const update = vi.fn<UpdateSquadAction>(async (): Promise<SquadAdminActionResult> => ({ ok: true }));
    const { unmount } = render(<SquadForm mode="edit" save={update} upload={upload} listHref="/admin/escuadrones" squad={{ ...SQUAD, logo: { path: UPLOADED, url: "https://cdn/l.svg" } }} />);
    const user = userEvent.setup();

    await user.click(save());
    expect(update.mock.calls[0][0]).not.toHaveProperty("logoPath");
    unmount();

    render(<SquadForm mode="edit" save={update} upload={upload} listHref="/admin/escuadrones" squad={{ ...SQUAD, logo: { path: UPLOADED, url: "https://cdn/l.svg" } }} />);
    await user.click(screen.getByRole("button", { name: copy.common.image.remove }));
    await user.click(save());
    expect(update.mock.calls[1][0]).toMatchObject({ logoPath: null });
  });

  it("shows the server's reason and stays on the form", async () => {
    const create = vi.fn<CreateSquadAction>(async (): Promise<SquadAdminActionResult> => ({ ok: false, code: "already-exists" }));
    render(<SquadForm mode="create" save={create} upload={upload} listHref="/admin/escuadrones" />);
    const user = userEvent.setup();

    await user.type(nameField(), "Escuadrón Gemini");
    await user.type(taglineField(), "Otro lema");
    paintFirstPixel();
    await user.click(save());

    expect(await screen.findByText(copy.admin.squads.errors["already-exists"])).toBeInTheDocument();
    expect(router.push).not.toHaveBeenCalled();
  });
});

describe("SquadForm edit", () => {
  beforeEach(() => vi.clearAllMocks());

  it("starts from the squad, never offers to change its id, and saves the changes", async () => {
    const update = vi.fn<UpdateSquadAction>(async () => ({ ok: true }));
    render(<SquadForm mode="edit" save={update} upload={upload} listHref="/admin/escuadrones" squad={SQUAD} />);
    const user = userEvent.setup();

    expect(nameField()).toHaveValue("Escuadrón Gemini");
    expect(screen.queryByLabelText(copy.admin.squads.form.idLabel)).not.toBeInTheDocument();
    await user.clear(taglineField());
    await user.type(taglineField(), "Nuevo lema");
    await user.click(save());

    expect(update).toHaveBeenCalledWith({ id: "gemini", name: "Escuadrón Gemini", tagline: "Nuevo lema", sprite: SQUAD.sprite });
    expect(router.push).toHaveBeenCalledWith("/admin/escuadrones");
  });

  it("has a way back to the list", () => {
    render(<SquadForm mode="edit" save={vi.fn()} upload={upload} listHref="/admin/escuadrones" squad={SQUAD} />);

    expect(screen.getByRole("link", { name: copy.admin.squads.form.back })).toHaveAttribute("href", "/admin/escuadrones");
  });

  it("has no detectable accessibility violations", async () => {
    const { container } = render(<SquadForm mode="edit" save={vi.fn()} upload={upload} listHref="/admin/escuadrones" squad={SQUAD} />);

    expect((await axe(container)).violations).toEqual([]);
  });
});
