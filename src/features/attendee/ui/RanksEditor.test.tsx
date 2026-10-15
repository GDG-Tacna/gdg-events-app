// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { copy } from "@/shared/copy/es";
import { axe } from "@/test-utils/axe";
import type { UploadImageAction } from "@/features/media";
import type { SaveRanksAction } from "./ranks-action";
import { RanksEditor } from "./RanksEditor";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

const r = copy.admin.ranks;
const RANKS = [
  { id: "recruit", name: "Recluta", minXp: 0 },
  { id: "pilot", name: "Piloto", minXp: 100 },
  { id: "commander", name: "Comandante", minXp: 500 },
];

const ICON = "public/devfest-2026/rank/0f8e2c1a-1111-4222-8333-944455551111.webp";
const upload = vi.fn<UploadImageAction>(async () => ({ ok: true, image: { path: ICON, url: `https://cdn/${ICON}`, width: 64, height: 64, format: "webp" } }));

function renderEditor(save: SaveRanksAction = vi.fn(async () => ({ ok: true as const })), isDefault = false) {
  render(<RanksEditor ranks={RANKS} isDefault={isDefault} save={save} upload={upload} />);
  return save;
}

const name = (n: number) => screen.getByLabelText(`Nombre del rango ${n}`);
const xp = (n: number) => screen.getByLabelText(`XP mínimo del rango ${n}`);
const saveButton = () => screen.getByRole("button", { name: r.save });

describe("RanksEditor", () => {
  beforeEach(() => refresh.mockReset());

  it("lists the ladder in order with its levels; the first rank starts at 0 and cannot change", () => {
    renderEditor(undefined, true);

    const list = screen.getByRole("list", { name: r.listLabel });
    expect(within(list).getAllByRole("listitem")).toHaveLength(3);
    expect(within(list).getByText("NV 3")).toBeInTheDocument();
    expect(name(2)).toHaveValue("Piloto");
    expect(xp(1)).toHaveAttribute("readonly");
    expect(xp(1)).toHaveAccessibleDescription(r.firstFixed);
    expect(screen.queryByRole("button", { name: "Quitar el rango 1" })).not.toBeInTheDocument();
    expect(screen.getByText(r.defaultNote)).toBeInTheDocument();
  });

  it("renames, changes XP, adds and removes ranks, and saves the ladder", async () => {
    const save = renderEditor();

    fireEvent.change(name(2), { target: { value: "  Piloto estelar " } });
    fireEvent.change(xp(2), { target: { value: "1a50" } });
    fireEvent.click(screen.getByRole("button", { name: r.add }));
    expect(name(4)).toHaveValue(r.newRank);
    expect(xp(4)).toHaveValue("600");
    fireEvent.click(screen.getByRole("button", { name: "Quitar el rango 3" }));
    fireEvent.click(saveButton());

    await waitFor(() => expect(save).toHaveBeenCalled());
    expect(save).toHaveBeenCalledWith([
      { id: "recruit", name: "Recluta", minXp: 0, iconPath: null },
      { id: "pilot", name: "Piloto estelar", minXp: 150, iconPath: null },
      { id: "rank-4", name: r.newRank, minXp: 600, iconPath: null },
    ]);
    expect(await screen.findByText(r.saved, { exact: false })).toHaveAttribute("role", "status");
    expect(refresh).toHaveBeenCalled();
  });

  it("gives a rank an icon and sends each rank's icon with the ladder", async () => {
    const save = renderEditor();

    fireEvent.change(screen.getAllByTestId("image-input-rank")[1], { target: { files: [new File([new Uint8Array(10)], "piloto.png", { type: "image/png" })] } });
    await screen.findByRole("img", { name: "Vista previa: Ícono del rango 2 (opcional)" });
    fireEvent.click(saveButton());

    await waitFor(() => expect(save).toHaveBeenCalled());
    expect(vi.mocked(save).mock.calls[0][0].map((rank) => rank.iconPath)).toEqual([null, ICON, null]);
  });

  it("will not save a broken ladder: it says what is wrong and where", () => {
    const save = renderEditor();

    fireEvent.change(xp(3), { target: { value: "100" } });
    fireEvent.change(name(2), { target: { value: "P" } });
    fireEvent.click(saveButton());

    const alert = screen.getByText(r.problemsTitle).closest("[role=alert]") as HTMLElement;
    expect(alert).toHaveTextContent("Rango 2: el nombre debe tener entre 2 y 30 caracteres.");
    expect(alert).toHaveTextContent("Rango 3: debe pedir más XP que el anterior.");
    expect(xp(3)).toHaveAttribute("aria-invalid", "true");
    expect(save).not.toHaveBeenCalled();
  });

  it("allows at most ten ranks", () => {
    renderEditor();
    for (let i = 0; i < 7; i += 1) fireEvent.click(screen.getByRole("button", { name: r.add }));

    expect(screen.getByRole("button", { name: r.add })).toBeDisabled();
  });

  it("explains a refusal, and an action that throws", async () => {
    renderEditor(vi.fn().mockResolvedValueOnce({ ok: false, code: "invalid-ranks" }).mockRejectedValueOnce(new Error("x")));

    fireEvent.click(saveButton());
    expect(await screen.findByRole("alert")).toHaveTextContent(r.errors["invalid-ranks"]);
    fireEvent.click(saveButton());
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(r.errors.unknown));
    expect(refresh).not.toHaveBeenCalled();
  });

  it("has no detectable accessibility violations", async () => {
    const { container } = render(<RanksEditor ranks={RANKS} isDefault save={vi.fn()} upload={upload} />);
    expect((await axe(container)).violations).toEqual([]);
  });
});
