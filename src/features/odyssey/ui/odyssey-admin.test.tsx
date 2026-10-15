// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { copy } from "@/shared/copy/es";
import { axe } from "@/test-utils/axe";
import type { Communication } from "../domain/communication";
import type { SaveCommunicationAction, SaveStoryTitleAction } from "./admin-actions";
import { CommunicationForm } from "./CommunicationForm";
import { CommunicationsAdminView } from "./CommunicationsAdminView";

const push = vi.fn();
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh }) }));

const o = copy.admin.odyssey;
const QUADRANTS = [
  { id: "ai", name: "AI" },
  { id: "cloud", name: "Google Cloud" },
];
const MISSIONS = [
  { id: "ai-stand", name: "Visita el stand de AI" },
  { id: "keynote", name: "Asiste a la charla inaugural" },
];
const comm = (id: string, extra: Partial<Communication> = {}): Communication => ({
  id,
  quadrantId: "ai",
  title: `Transmisión ${id}`,
  body: "Texto de la transmisión",
  unlockMissionId: null,
  order: 0,
  active: true,
  ...extra,
});

describe("CommunicationsAdminView", () => {
  beforeEach(() => refresh.mockReset());

  function renderView(communications: Communication[], overrides = {}) {
    const props = {
      communications,
      quadrants: QUADRANTS,
      missions: MISSIONS,
      defaultsCount: 10,
      seed: vi.fn(async () => ({ ok: true as const })),
      setActive: vi.fn(async () => ({ ok: true as const })),
      move: vi.fn(async () => ({ ok: true as const })),
      storyTitle: null as string | null,
      saveTitle: vi.fn<SaveStoryTitleAction>(async () => ({ ok: true })),
      hrefs: { create: "/admin/odisea/nueva", editBase: "/admin/odisea" },
      ...overrides,
    };
    return { ...render(<CommunicationsAdminView {...props} />), props };
  }

  it("lists transmissions with their quadrant, what opens them and their state", () => {
    renderView([comm("open-one"), comm("by-mission", { unlockMissionId: "ai-stand" }), comm("lost", { quadrantId: "gone", active: false })]);

    expect(screen.getByText("Transmisión open-one").closest("li")).toHaveTextContent(`AI · ${o.fromStart}`);
    expect(screen.getByText("Transmisión by-mission").closest("li")).toHaveTextContent("Se descifra con «Visita el stand de AI»");
    expect(screen.getByText("Transmisión lost").closest("li")).toHaveTextContent(o.otherQuadrant);
    expect(screen.getByText("Transmisión lost").closest("li")).toHaveTextContent(o.inactive);
    expect(screen.getByRole("link", { name: `${o.edit}: Transmisión lost` })).toHaveAttribute("href", "/admin/odisea/lost");
  });

  it("moves, deactivates and seeds, and explains a refusal", async () => {
    const { props } = renderView([comm("aa"), comm("bb")], { setActive: vi.fn(async () => ({ ok: false as const, code: "not-found" as const })) });

    fireEvent.keyDown(screen.getByRole("button", { name: "Mover Transmisión aa" }), { key: "ArrowDown" });
    await waitFor(() => expect(props.move).toHaveBeenCalledWith({ id: "aa", to: 1 }));
    await waitFor(() => expect(screen.getByRole("button", { name: `${o.deactivate}: Transmisión bb` })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: `${o.deactivate}: Transmisión bb` }));
    expect(await screen.findByRole("alert")).toHaveTextContent(o.errors["not-found"]);
  });

  it("offers the bundled set to an empty edition", async () => {
    const { props } = renderView([]);

    expect(screen.getByText(/leen las 10 transmisiones por defecto/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: o.seed }));
    expect(await screen.findByText(o.seeded, { exact: false })).toHaveAttribute("role", "status");
    expect(props.seed).toHaveBeenCalled();
  });

  it("names the story with a tidy title, and a blank one goes back to the generic name", async () => {
    const { props } = renderView([comm("aa")], { storyTitle: "Odisea de Código" });
    const field = screen.getByLabelText(o.story.label);
    expect(field).toHaveValue("Odisea de Código");

    fireEvent.change(field, { target: { value: "  La   isla del tesoro " } });
    fireEvent.click(screen.getByRole("button", { name: o.story.save }));
    expect(await screen.findByText("Listo: los cadetes ven «La isla del tesoro».")).toHaveAttribute("role", "status");
    expect(props.saveTitle).toHaveBeenCalledWith({ title: "La isla del tesoro" });
    expect(refresh).toHaveBeenCalled();

    fireEvent.change(field, { target: { value: "   " } });
    fireEvent.click(screen.getByRole("button", { name: o.story.save }));
    expect(await screen.findByText(o.story.cleared)).toBeInTheDocument();
    expect(props.saveTitle).toHaveBeenLastCalledWith({ title: "" });
  });

  it("explains a refused title", async () => {
    renderView([comm("aa")], { saveTitle: vi.fn(async () => ({ ok: false as const, code: "invalid-story-title" as const })) });

    fireEvent.change(screen.getByLabelText(o.story.label), { target: { value: "ab" } });
    fireEvent.click(screen.getByRole("button", { name: o.story.save }));
    expect(await screen.findByRole("alert")).toHaveTextContent(o.errors["invalid-story-title"]);
  });

  it("has no detectable accessibility violations", async () => {
    const { container } = renderView([comm("aa")]);
    expect((await axe(container)).violations).toEqual([]);
  });
});

describe("CommunicationForm", () => {
  beforeEach(() => {
    push.mockReset();
    refresh.mockReset();
  });

  const type = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

  it("creates a transmission opened by a mission, with an id from the title, and goes back to the list", async () => {
    const save = vi.fn<SaveCommunicationAction>(async () => ({ ok: true }));
    render(<CommunicationForm mode="create" save={save} quadrants={QUADRANTS} missions={MISSIONS} listHref="/admin/odisea" />);

    type(o.form.title, "Señal de la nube");
    type(o.form.body, "Una estación orbital transmite.");
    type(o.form.quadrant, "cloud");
    type(o.form.unlock, "keynote");
    fireEvent.click(screen.getByRole("button", { name: o.form.save }));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/admin/odisea"));
    expect(save).toHaveBeenCalledWith({ id: "senal-de-la-nube", draft: { quadrantId: "cloud", title: "Señal de la nube", body: "Una estación orbital transmite.", unlockMissionId: "keynote" } });
  });

  it("saves one open from the start with no mission", async () => {
    const save = vi.fn<SaveCommunicationAction>(async () => ({ ok: true }));
    render(<CommunicationForm mode="create" save={save} quadrants={QUADRANTS} missions={MISSIONS} listHref="/x" />);

    type(o.form.title, "Mensaje del Mando");
    type(o.form.body, "Bienvenido a la flota, cadete.");
    fireEvent.click(screen.getByRole("button", { name: o.form.save }));

    await waitFor(() => expect(save).toHaveBeenCalled());
    expect(save.mock.calls[0][0].draft.unlockMissionId).toBeNull();
  });

  it("sends no mission for one open from the start, and checks the fields first", () => {
    const save = vi.fn<SaveCommunicationAction>();
    render(<CommunicationForm mode="create" save={save} quadrants={QUADRANTS} missions={MISSIONS} listHref="/x" />);

    expect(screen.getByLabelText(o.form.unlock)).toHaveValue("");
    type(o.form.title, "Señal");
    type(o.form.body, "corto");
    fireEvent.click(screen.getByRole("button", { name: o.form.save }));

    expect(screen.getByText(o.errors["invalid-body"])).toBeInTheDocument();
    expect(save).not.toHaveBeenCalled();
  });

  it("edits a transmission without its id, and shows a server refusal on its field", async () => {
    const save = vi.fn<SaveCommunicationAction>(async () => ({ ok: false, code: "unknown-mission" }));
    render(<CommunicationForm mode="edit" communication={comm("ai-senal", { unlockMissionId: "ai-stand" })} save={save} quadrants={QUADRANTS} missions={MISSIONS} listHref="/x" />);

    expect(screen.queryByLabelText(o.form.id)).not.toBeInTheDocument();
    expect(screen.getByLabelText(o.form.unlock)).toHaveValue("ai-stand");
    fireEvent.click(screen.getByRole("button", { name: o.form.save }));

    expect(await screen.findByText(o.errors["unknown-mission"])).toBeInTheDocument();
    expect(save).toHaveBeenCalledWith({ id: "ai-senal", draft: expect.objectContaining({ unlockMissionId: "ai-stand" }) });
    expect(push).not.toHaveBeenCalled();
  });

  it("has no detectable accessibility violations", async () => {
    const { container } = render(<CommunicationForm mode="create" save={vi.fn()} quadrants={QUADRANTS} missions={MISSIONS} listHref="/x" />);
    expect((await axe(container)).violations).toEqual([]);
  });
});
