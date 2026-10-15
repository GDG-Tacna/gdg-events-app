// @vitest-environment jsdom
import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { copy } from "@/shared/copy/es";
import { axe } from "@/test-utils/axe";
import type { Badge } from "../domain/badge";
import type { MoveBadgeAction, SaveBadgeAction, SeedBadgesAction, SetBadgeActiveAction } from "./admin-actions";
import type { UploadImageAction } from "@/features/media";
import { BadgeForm } from "./BadgeForm";
import { BadgesAdminView } from "./BadgesAdminView";

const router = vi.hoisted(() => ({ refresh: vi.fn(), push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

const t = copy.admin.achievements;
const f = t.form;
const UPLOADED = "public/devfest-2026/badge/0f8e2c1a-1111-4222-8333-944455551111.webp";
const NAMES = { quadrants: { ai: "IA" }, missions: { "ai-quiz": "Quiz de IA" } };
const FIRST: Badge = { id: "primer-salto", name: "Primer salto", description: "Completa tu primera misión.", tone: "cyan", rule: { type: "missions-completed", count: 1 }, order: 0, active: true, image: null };
const AI: Badge = { id: "maestro-ia", name: "Maestro de la IA", description: "Todo el cuadrante de IA.", tone: "gold", rule: { type: "quadrant-complete", quadrantId: "ai" }, order: 1, active: false, image: null };
const QUADRANTS = [
  { id: "ai", name: "IA" },
  { id: "cloud", name: "Cloud" },
];
const MISSIONS = [{ id: "ai-quiz", name: "Quiz de IA" }];
const LEVELS = [
  { level: 1, name: "Recluta" },
  { level: 2, name: "Piloto" },
  { level: 3, name: "Comandante" },
];

beforeEach(() => {
  router.refresh.mockReset();
  router.push.mockReset();
});

describe("BadgesAdminView", () => {
  const setup = (badges: Badge[] = [FIRST, AI], overrides: { seed?: SeedBadgesAction; setActive?: SetBadgeActiveAction; move?: MoveBadgeAction } = {}) => {
    const props = {
      seed: vi.fn<SeedBadgesAction>(async () => ({ ok: true })),
      setActive: vi.fn<SetBadgeActiveAction>(async () => ({ ok: true })),
      move: vi.fn<MoveBadgeAction>(async () => ({ ok: true })),
      ...overrides,
    };
    const view = render(<BadgesAdminView badges={badges} names={NAMES} defaultsCount={9} hrefs={{ create: "/admin/logros/nueva", editBase: "/admin/logros" }} {...props} />);
    return { ...props, view };
  };
  const item = (name: string) => within(screen.getByRole("list", { name: t.listLabel })).getAllByRole("listitem").find((li) => li.textContent?.includes(name))!;

  it("lists each badge with its rule in words, its state, and links to edit it", async () => {
    const { view } = setup();

    expect(item("Primer salto")).toHaveTextContent("Completa 1 misión");
    expect(item("Primer salto")).toHaveTextContent(t.active);
    expect(item("Maestro de la IA")).toHaveTextContent("Completa todas las misiones de IA");
    expect(item("Maestro de la IA")).toHaveTextContent(t.inactive);
    expect(screen.getByRole("link", { name: `${t.edit}: Maestro de la IA` })).toHaveAttribute("href", "/admin/logros/maestro-ia");
    expect(screen.getByRole("link", { name: t.create })).toHaveAttribute("href", "/admin/logros/nueva");
    expect(screen.getByRole("button", { name: "Mover Primer salto" })).toBeInTheDocument();
    expect((await axe(view.container)).violations).toEqual([]);
  });

  it("moves, deactivates and activates, refreshing the list", async () => {
    const { move, setActive } = setup();

    fireEvent.keyDown(screen.getByRole("button", { name: "Mover Primer salto" }), { key: "ArrowDown" });
    await vi.waitFor(() => expect(router.refresh).toHaveBeenCalledTimes(1));
    expect(move).toHaveBeenCalledWith({ id: "primer-salto", to: 1 });

    fireEvent.click(screen.getByRole("button", { name: `${t.deactivate}: Primer salto` }));
    expect(await screen.findByText("«Primer salto» ya no se muestra ni se otorga; quien la ganó la conserva.", { exact: false })).toHaveAttribute("role", "status");
    expect(setActive).toHaveBeenCalledWith({ id: "primer-salto", active: false });

    fireEvent.click(screen.getByRole("button", { name: `${t.activate}: Maestro de la IA` }));
    expect(await screen.findByText("«Maestro de la IA» vuelve a otorgarse.")).toBeInTheDocument();
  });

  it("explains a refusal or a dropped connection", async () => {
    setup(undefined, { move: vi.fn<MoveBadgeAction>().mockResolvedValueOnce({ ok: false, code: "forbidden" }).mockRejectedValueOnce(new Error("offline")) });

    fireEvent.keyDown(screen.getByRole("button", { name: "Mover Primer salto" }), { key: "ArrowDown" });
    expect(await screen.findByText(t.errors.forbidden)).toBeInTheDocument();
    // The refused move is undone before trying again.
    await vi.waitFor(() => expect(screen.getAllByRole("listitem")[0]).toHaveTextContent("Primer salto"));
    fireEvent.keyDown(screen.getByRole("button", { name: "Mover Primer salto" }), { key: "ArrowDown" });
    expect(await screen.findByText(t.errors.unknown)).toBeInTheDocument();
    expect(router.refresh).not.toHaveBeenCalled();
  });

  it("offers the bundled badges to an empty edition", async () => {
    const { seed } = setup([]);

    expect(screen.getByText(/las 9 insignias por defecto/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: t.seed }));
    expect(await screen.findByText(t.seeded, { exact: false })).toHaveAttribute("role", "status");
    expect(seed).toHaveBeenCalled();
  });
});

describe("BadgeForm", () => {
  const setup = (props: Partial<Parameters<typeof BadgeForm>[0]> = {}) => {
    const save = vi.fn<SaveBadgeAction>(async () => ({ ok: true }));
    const upload = vi.fn<UploadImageAction>(async () => ({ ok: true, image: { path: UPLOADED, url: `https://cdn/${UPLOADED}`, width: 64, height: 64, format: "webp" } }));
    const view = render(<BadgeForm mode="create" save={save} upload={upload} quadrants={QUADRANTS} missions={MISSIONS} levels={LEVELS} listHref="/admin/logros" {...props} />);
    return { save, upload, view };
  };
  const type = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
  const submit = () => fireEvent.click(screen.getByRole("button", { name: f.save }));

  it("creates a count badge with an id from its name and a preview of what cadets see", async () => {
    const { save, view } = setup();

    type(f.name, "Cazador de quizzes");
    type(f.description, "Completa 5 misiones cualquiera.");
    fireEvent.click(screen.getByRole("radio", { name: new RegExp(f.tones.magenta) }));
    type(f.count, "5x");

    const preview = within(screen.getByRole("region", { name: f.preview }));
    expect(preview.getByText("Cazador de quizzes")).toBeInTheDocument();
    expect(preview.getByText("Completa 5 misiones")).toBeInTheDocument();
    expect(screen.getByLabelText(f.id)).toHaveValue("cazador-de-quizzes");
    expect((await axe(view.container)).violations).toEqual([]);

    submit();
    await vi.waitFor(() => expect(router.push).toHaveBeenCalledWith("/admin/logros"));
    expect(save).toHaveBeenCalledWith({
      id: "cazador-de-quizzes",
      draft: { name: "Cazador de quizzes", description: "Completa 5 misiones cualquiera.", tone: "magenta", rule: { type: "missions-completed", count: 5 } },
    });
    expect(router.refresh).toHaveBeenCalled();
  });

  it.each([
    ["talks-attended", f.count, "3", { type: "talks-attended", count: 3 }],
    ["stands-visited", f.count, "2", { type: "stands-visited", count: 2 }],
    ["credits-earned", f.credits, "250", { type: "credits-earned", count: 250 }],
    ["level-reached", f.level, "3", { type: "level-reached", level: 3 }],
    ["quadrant-complete", f.quadrant, "cloud", { type: "quadrant-complete", quadrantId: "cloud" }],
    ["mission-completed", f.mission, "ai-quiz", { type: "mission-completed", missionId: "ai-quiz" }],
    ["contacts-made", f.count, "5", { type: "contacts-made", count: 5 }],
  ])("builds a %s rule from its parameter", async (ruleType, label, value, rule) => {
    const { save } = setup();
    type(f.name, "Insignia");
    type(f.description, "Haz algo.");
    type(f.rule, ruleType);
    type(label, value);
    submit();

    await vi.waitFor(() => expect(save).toHaveBeenCalled());
    expect(save.mock.calls[0][0].draft.rule).toEqual(rule);
  });

  it("saves a level rule at level 2 when the admin keeps the first level offered", async () => {
    const { save } = setup();
    type(f.name, "Alas");
    type(f.description, "Sube de nivel.");
    type(f.rule, "level-reached");
    submit();

    await vi.waitFor(() => expect(save).toHaveBeenCalled());
    expect(save.mock.calls[0][0].draft.rule).toEqual({ type: "level-reached", level: 2 });
  });

  it("offers the levels from 2 by their rank name, and starts each rule type from a sensible value", () => {
    setup();
    type(f.rule, "level-reached");
    const levels = within(screen.getByLabelText(f.level)).getAllByRole("option").map((option) => option.textContent);
    expect(levels.slice(0, 3)).toEqual(["Piloto (NV 2)", "Comandante (NV 3)", "NV 4"]);
    expect(levels).toHaveLength(9);
    expect(screen.getByLabelText(f.level)).toHaveValue("2");

    type(f.rule, "quadrant-complete");
    expect(screen.getByLabelText(f.quadrant)).toHaveValue("ai");
    type(f.rule, "mission-completed");
    expect(screen.getByLabelText(f.mission)).toHaveValue("");
    type(f.rule, "missions-completed");
    expect(screen.getByLabelText(f.count)).toHaveValue("1");
  });

  it("points each problem at its field before sending, and a server refusal too", async () => {
    const save = vi.fn<SaveBadgeAction>(async () => ({ ok: false, code: "unknown-mission" }));
    setup({ save });

    submit();
    expect(screen.getByLabelText(f.name)).toHaveAccessibleDescription(expect.stringContaining(t.errors["invalid-name"]));
    type(f.name, "Insignia");
    submit();
    expect(screen.getByLabelText(f.description)).toHaveAccessibleDescription(expect.stringContaining(t.errors["invalid-description"]));
    type(f.description, "Haz algo.");
    type(f.count, "");
    submit();
    expect(screen.getByLabelText(f.count)).toHaveAccessibleDescription(expect.stringContaining(t.errors["invalid-rule"]));
    type(f.rule, "mission-completed");
    submit();
    expect(screen.getByLabelText(f.mission)).toHaveAccessibleDescription(expect.stringContaining(t.errors["invalid-rule"]));
    expect(save).not.toHaveBeenCalled();

    type(f.mission, "ai-quiz");
    submit();
    expect(await screen.findByText(t.errors["unknown-mission"])).toBeInTheDocument();
    expect(screen.getByLabelText(f.mission)).toHaveAccessibleDescription(expect.stringContaining(t.errors["unknown-mission"]));
    expect(router.push).not.toHaveBeenCalled();
  });

  it("shows a refusal without a field above the form, and a dropped connection as unknown", async () => {
    const save = vi.fn<SaveBadgeAction>().mockResolvedValueOnce({ ok: false, code: "forbidden" }).mockRejectedValueOnce(new Error("offline"));
    setup({ save });
    type(f.name, "Insignia");
    type(f.description, "Haz algo.");

    submit();
    expect(await screen.findByRole("alert")).toHaveTextContent(t.errors.forbidden);
    submit();
    expect(await screen.findByText(t.errors.unknown)).toBeInTheDocument();
  });

  it("edits a badge with its values and its id fixed", async () => {
    const { save } = setup({ mode: "edit", badge: AI });

    expect(screen.getByRole("heading", { level: 1, name: f.editTitle })).toBeInTheDocument();
    expect(screen.queryByLabelText(f.id)).not.toBeInTheDocument();
    expect(screen.getByLabelText(f.name)).toHaveValue("Maestro de la IA");
    expect(screen.getByRole("radio", { name: new RegExp(f.tones.gold) })).toBeChecked();
    expect(screen.getByLabelText(f.rule)).toHaveValue("quadrant-complete");
    expect(screen.getByLabelText(f.quadrant)).toHaveValue("ai");

    submit();
    await vi.waitFor(() => expect(save).toHaveBeenCalled());
    expect(save.mock.calls[0][0]).toEqual({ id: "maestro-ia", draft: { name: AI.name, description: AI.description, tone: "gold", rule: AI.rule } });
  });

  it("uploads an image that replaces the medal in the preview, and sends its path", async () => {
    const { save, upload } = setup({ mode: "edit", badge: AI });

    fireEvent.change(screen.getByTestId("image-input-badge"), { target: { files: [new File([new Uint8Array(10)], "medalla.png", { type: "image/png" })] } });
    await vi.waitFor(() => expect(upload).toHaveBeenCalled());
    expect(await screen.findByRole("img", { name: `Vista previa: ${f.image}` })).toHaveAttribute("src", `https://cdn/${UPLOADED}`);

    submit();
    await vi.waitFor(() => expect(save).toHaveBeenCalled());
    expect(save.mock.calls[0][0].draft.imagePath).toBe(UPLOADED);
  });

  it("removes a badge's image, sending null", async () => {
    const { save } = setup({ mode: "edit", badge: { ...AI, image: { path: UPLOADED, url: `https://cdn/${UPLOADED}` } } });

    fireEvent.click(screen.getByRole("button", { name: copy.common.image.remove }));
    submit();

    await vi.waitFor(() => expect(save).toHaveBeenCalled());
    expect(save.mock.calls[0][0].draft.imagePath).toBeNull();
  });

  it("shows a refused image next to the image field", async () => {
    setup({ save: vi.fn<SaveBadgeAction>(async () => ({ ok: false, code: "invalid-image" })), mode: "edit", badge: AI });

    submit();

    expect(await screen.findByText(t.errors["invalid-image"])).toHaveAttribute("role", "alert");
  });

  it.each<[Badge["rule"], string, string]>([
    [{ type: "level-reached", level: 3 }, f.level, "3"],
    [{ type: "mission-completed", missionId: "ai-quiz" }, f.mission, "ai-quiz"],
    [{ type: "credits-earned", count: 40 }, f.credits, "40"],
  ])("opens a saved %j rule with its parameter", (rule, label, value) => {
    setup({ mode: "edit", badge: { ...FIRST, rule } });

    expect(screen.getByLabelText(label)).toHaveValue(value);
  });
});
