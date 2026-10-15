// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { copy } from "@/shared/copy/es";
import { axe } from "@/test-utils/axe";
import type { Quadrant } from "../domain/quadrant";
import type { VenueMap } from "../domain/venue";
import type { UploadImageAction } from "@/features/media";
import type { SaveVenueAction } from "./admin-actions";
import { VenueEditor } from "./VenueEditor";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

const e = copy.admin.map.editor;
const QUADRANTS: Quadrant[] = [
  { id: "ai", name: "AI", tagline: "Lema", planet: "ai", order: 0, active: true },
  { id: "cloud", name: "Google Cloud", tagline: "Lema", planet: "cloud", order: 1, active: false },
];
const VENUE: VenueMap = {
  width: 50,
  height: 40,
  areas: [
    { id: "ai-1", kind: "stand", label: "Stand AI", quadrantId: "ai", rect: { x: 0, y: 0, width: 10, height: 10 } },
    { id: "hall", kind: "auditorium", label: "Auditorio", quadrantId: null, rect: { x: 20, y: 10, width: 20, height: 20 } },
  ],
};

const PLAN_PATH = "public/devfest-2026/venue-plan/0f8e2c1a-1111-4222-8333-944455551111.svg";
const upload = vi.fn<UploadImageAction>(async () => ({ ok: true, image: { path: PLAN_PATH, url: `https://cdn/${PLAN_PATH}`, width: 842, height: 595, format: "svg" } }));

function renderEditor(save: SaveVenueAction = vi.fn(async () => ({ ok: true as const, standQrs: [], failedQrs: [] })), venue = VENUE) {
  render(<VenueEditor venue={venue} isDefault={false} quadrants={QUADRANTS} save={save} upload={upload} hrefs={{ back: "/admin/mapa", checkpoints: "/admin/puestos" }} />);
  return save;
}

const canvas = () => screen.getByRole("group", { name: e.canvasLabel });
const areaButton = (label: RegExp) => within(canvas()).getByRole("button", { name: label });
const field = (label: string) => screen.getByLabelText(label) as HTMLInputElement;
const setNumber = (label: string, value: string) => {
  fireEvent.change(field(label), { target: { value } });
  fireEvent.blur(field(label));
};

describe("VenueEditor", () => {
  beforeEach(() => refresh.mockReset());

  it("draws every area as a button that says where it is", () => {
    renderEditor();

    expect(areaButton(/^Stand AI: Stand, posición 0, 0, tamaño 10 × 10$/)).toBeInTheDocument();
    expect(areaButton(/^Auditorio: Auditorio, posición 20, 10/)).toHaveTextContent("Auditorio");
    expect(screen.getByText(e.noSelection)).toBeInTheDocument();
  });

  it("moves the chosen area with the arrows and resizes it with Shift + arrows, inside the plan", () => {
    renderEditor();

    const stand = areaButton(/^Stand AI:/);
    fireEvent.keyDown(stand, { key: "ArrowRight" });
    fireEvent.keyDown(stand, { key: "ArrowDown" });
    fireEvent.keyDown(stand, { key: "ArrowLeft", shiftKey: true });
    fireEvent.keyDown(stand, { key: "ArrowUp" });
    fireEvent.keyDown(stand, { key: "ArrowUp" });

    expect(areaButton(/^Stand AI:/)).toHaveAccessibleName("Stand AI: Stand, posición 1, 0, tamaño 9 × 10");
    expect(areaButton(/^Stand AI:/)).toHaveAttribute("aria-pressed", "true");
  });

  it("moves an area by dragging it, in plan units", () => {
    renderEditor();
    canvas().getBoundingClientRect = () => ({ left: 0, top: 0, width: 500, height: 400, right: 500, bottom: 400, x: 0, y: 0, toJSON: () => ({}) });

    fireEvent.pointerDown(areaButton(/^Stand AI:/), { button: 0, clientX: 50, clientY: 50, pointerId: 1 });
    fireEvent.pointerMove(canvas(), { clientX: 81, clientY: 70, pointerId: 1 });
    fireEvent.pointerUp(canvas(), { pointerId: 1 });
    fireEvent.pointerMove(canvas(), { clientX: 300, clientY: 300, pointerId: 1 });

    expect(areaButton(/^Stand AI:/)).toHaveAccessibleName("Stand AI: Stand, posición 3, 2, tamaño 10 × 10");
  });

  it("edits the chosen area's name, kind, quadrant, position and size from the panel", () => {
    renderEditor();
    fireEvent.click(areaButton(/^Stand AI:/));

    fireEvent.change(field(e.label), { target: { value: "Stand Gemini" } });
    fireEvent.change(field(e.quadrant), { target: { value: "cloud" } });
    expect(screen.getByRole("option", { name: `Google Cloud (${copy.admin.map.inactive})` })).toBeInTheDocument();
    setNumber(e.x, "45");
    setNumber(e.areaHeight, "12");

    expect(areaButton(/^Stand Gemini:/)).toHaveAccessibleName("Stand Gemini: Stand, posición 40, 0, tamaño 10 × 12");

    fireEvent.change(field(e.kind), { target: { value: "service" } });
    expect(screen.queryByLabelText(e.quadrant)).not.toBeInTheDocument();
    expect(areaButton(/^Stand Gemini:/)).toHaveTextContent("Stand Gemini");
  });

  it("adds a stand in a free spot and chooses it, and removes an area", () => {
    renderEditor();

    fireEvent.click(screen.getByRole("button", { name: e.addArea }));
    expect(field(e.label)).toHaveValue(e.newStand);
    expect(field(e.quadrant)).toHaveValue("ai");
    expect(areaButton(/^Stand nuevo: Stand, posición 0, 10/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: e.removeArea }));
    expect(within(canvas()).queryByRole("button", { name: /^Stand nuevo/ })).not.toBeInTheDocument();
    expect(screen.getByText(e.noSelection)).toBeInTheDocument();
  });

  it("changes the plan size, pulling areas back inside", () => {
    renderEditor();

    setNumber(e.width, "30");

    expect(areaButton(/^Auditorio:/)).toHaveAccessibleName("Auditorio: Auditorio, posición 10, 10, tamaño 20 × 20");
  });

  it("will not save a plan with problems: it lists them, and each one chooses its area", async () => {
    const save = renderEditor();
    fireEvent.click(areaButton(/^Stand AI:/));
    setNumber(e.x, "25");
    setNumber(e.y, "5");
    fireEvent.change(field(e.label), { target: { value: "x" } });

    fireEvent.click(screen.getByRole("button", { name: e.save }));

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("«Auditorio»: está encima de otra área.");
    expect(alert).toHaveTextContent("«x»: el nombre debe tener entre 2 y 40 caracteres.");
    expect(save).not.toHaveBeenCalled();
    fireEvent.click(within(alert).getByRole("button", { name: "«Auditorio»: está encima de otra área." }));
    expect(field(e.label)).toHaveValue("Auditorio");
  });

  it("saves, says how many stand QR codes were created, and links to Puestos", async () => {
    const save = renderEditor(vi.fn(async () => ({ ok: true as const, standQrs: ["stand-ai-1"], failedQrs: [] })));

    fireEvent.click(screen.getByRole("button", { name: e.save }));

    const status = await screen.findByRole("status");
    expect(status).toHaveTextContent("Plano guardado. Se crearon 1 QR de stands nuevos.");
    expect(within(status).getByRole("link", { name: e.toCheckpoints })).toHaveAttribute("href", "/admin/puestos");
    expect(save).toHaveBeenCalledWith({ ...VENUE, backgroundPath: null });
    expect(refresh).toHaveBeenCalled();
  });

  it("puts the uploaded real plan under the areas, offers to fit the grid to it, and saves its path", async () => {
    const save = renderEditor();
    const canvas = screen.getByRole("group", { name: e.canvasLabel });
    expect(canvas.querySelector("img")).toBeNull();

    fireEvent.change(screen.getByTestId("image-input-venue-plan"), { target: { files: [new File(["<svg/>"], "plano.svg", { type: "image/svg+xml" })] } });
    await waitFor(() => expect(canvas.querySelector("img")).toHaveAttribute("src", `https://cdn/${PLAN_PATH}`));

    // 842 x 595 keeps the width of 50 and takes a height of 35.
    fireEvent.click(screen.getByRole("button", { name: e.fit }));
    expect(canvas).toHaveStyle({ aspectRatio: "50 / 35" });
    expect(screen.queryByRole("button", { name: e.fit })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: e.save }));
    await waitFor(() => expect(save).toHaveBeenCalled());
    expect(vi.mocked(save).mock.calls[0][0]).toMatchObject({ width: 50, height: 35, backgroundPath: PLAN_PATH });
  });

  it("removes the real plan, saving null", async () => {
    const save = renderEditor(undefined, { ...VENUE, background: { path: PLAN_PATH, url: `https://cdn/${PLAN_PATH}` } });

    fireEvent.click(screen.getByRole("button", { name: copy.common.image.remove }));
    fireEvent.click(screen.getByRole("button", { name: e.save }));

    await waitFor(() => expect(save).toHaveBeenCalled());
    expect(vi.mocked(save).mock.calls[0][0].backgroundPath).toBeNull();
  });

  it("warns about stand QR codes that could not be created", async () => {
    renderEditor(vi.fn(async () => ({ ok: true as const, standQrs: [], failedQrs: ["stand-ai-1"] })));

    fireEvent.click(screen.getByRole("button", { name: e.save }));

    expect(await screen.findByRole("alert")).toHaveTextContent("No se pudo crear el QR de: stand-ai-1.");
  });

  it("explains a refusal, and an action that throws", async () => {
    renderEditor(vi.fn().mockResolvedValueOnce({ ok: false, code: "unknown-quadrant" }).mockRejectedValueOnce(new Error("x")));

    fireEvent.click(screen.getByRole("button", { name: e.save }));
    expect(await screen.findByRole("alert")).toHaveTextContent(copy.admin.map.errors["unknown-quadrant"]);

    fireEvent.click(screen.getByRole("button", { name: e.save }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(copy.admin.map.errors.unknown));
  });

  it("has no detectable accessibility violations, with and without an area chosen", async () => {
    const { container } = render(<VenueEditor venue={VENUE} isDefault quadrants={QUADRANTS} save={vi.fn()} upload={upload} hrefs={{ back: "/a", checkpoints: "/p" }} />);
    expect(screen.getByText(e.defaultNote)).toBeInTheDocument();
    expect((await axe(container)).violations).toEqual([]);

    fireEvent.click(within(canvas()).getByRole("button", { name: /^Stand AI:/ }));
    expect((await axe(container)).violations).toEqual([]);
  });
});
