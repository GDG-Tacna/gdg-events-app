// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { copy } from "@/shared/copy/es";
import { axe } from "@/test-utils/axe";
import type { SaveQuadrantAction } from "./admin-actions";
import { QuadrantForm } from "./QuadrantForm";

const push = vi.fn();
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh }) }));

const f = copy.admin.map.quadrantForm;
const type = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const submit = () => fireEvent.click(screen.getByRole("button", { name: f.save }));

describe("QuadrantForm", () => {
  beforeEach(() => {
    push.mockReset();
    refresh.mockReset();
  });

  it("creates a quadrant: suggests the id from the name, sends the planet, and goes back to the map", async () => {
    const save = vi.fn<SaveQuadrantAction>(async () => ({ ok: true }));
    render(<QuadrantForm mode="create" save={save} listHref="/admin/mapa" />);

    type(f.name, "Desarrollo Web");
    type(f.tagline, "Construye la web del futuro");
    type(f.planet, "firebase");
    expect(screen.getByLabelText(f.id)).toHaveValue("desarrollo-web");
    submit();

    await waitFor(() => expect(push).toHaveBeenCalledWith("/admin/mapa"));
    expect(save).toHaveBeenCalledWith({ id: "desarrollo-web", name: "Desarrollo Web", tagline: "Construye la web del futuro", planet: "firebase" });
  });

  it("checks name, tagline and id before sending", () => {
    const save = vi.fn<SaveQuadrantAction>();
    render(<QuadrantForm mode="create" save={save} listHref="/x" />);

    type(f.name, "W");
    submit();
    expect(screen.getByText(copy.admin.map.errors["invalid-name"])).toBeInTheDocument();
    type(f.name, "Web");
    submit();
    expect(screen.getByText(copy.admin.map.errors["invalid-tagline"])).toBeInTheDocument();
    type(f.tagline, "Lema");
    type(f.id, "Web Dev");
    submit();
    expect(screen.getByText(copy.admin.map.errors["invalid-id"])).toBeInTheDocument();
    expect(save).not.toHaveBeenCalled();
  });

  it("edits a quadrant without its id, and shows a server refusal", async () => {
    const save = vi.fn<SaveQuadrantAction>(async () => ({ ok: false, code: "not-found" }));
    render(<QuadrantForm mode="edit" quadrant={{ id: "ai", name: "AI", tagline: "Lema", planet: "ai", order: 0, active: true }} save={save} listHref="/x" />);

    expect(screen.queryByLabelText(f.id)).not.toBeInTheDocument();
    expect(screen.getByLabelText(f.planet)).toHaveValue("ai");
    submit();

    expect(await screen.findByRole("alert")).toHaveTextContent(copy.admin.map.errors["not-found"]);
    expect(save).toHaveBeenCalledWith({ id: "ai", name: "AI", tagline: "Lema", planet: "ai" });
    expect(push).not.toHaveBeenCalled();
  });

  it("shows a taken id on the id field", async () => {
    render(<QuadrantForm mode="create" save={vi.fn(async () => ({ ok: false as const, code: "already-exists" as const }))} listHref="/x" />);
    type(f.name, "AI");
    type(f.tagline, "Lema");
    submit();

    expect(await screen.findByText(copy.admin.map.errors["already-exists"])).toBeInTheDocument();
    expect(screen.getByLabelText(f.id)).toHaveAttribute("aria-invalid", "true");
  });

  it("has no detectable accessibility violations", async () => {
    const { container } = render(<QuadrantForm mode="create" save={vi.fn()} listHref="/x" />);
    expect((await axe(container)).violations).toEqual([]);
  });
});
