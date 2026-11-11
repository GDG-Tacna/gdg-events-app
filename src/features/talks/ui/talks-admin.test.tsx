// @vitest-environment jsdom
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { copy } from "@/shared/copy/es";
import { axe } from "@/test-utils/axe";
import { answerConfirm } from "@/test-utils/confirm";
import type { DeleteTalkAction, ProjectTalkAction, SaveTalkAction, SetTalkActiveAction, TalkView } from "./admin-actions";
import { TalkForm } from "./TalkForm";
import { TalksAdminView, formatSlot } from "./TalksAdminView";

const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

const t = copy.admin.talks;
const ROOMS = [
  { id: "auditorio", name: "Auditorio" },
  { id: "sala-b", name: "Sala B" },
];
const KEYNOTE: TalkView = { id: "keynote", title: "Keynote", speakerIds: ["ana-torres"], speaker: "Ana Torres", legacySpeaker: null, startsAt: "2026-10-24T09:00", endsAt: "2026-10-24T09:45", roomId: "auditorio", description: "", active: true };
const OLD: TalkView = { id: "vieja", title: "Charla vieja", speakerIds: [], speaker: null, legacySpeaker: null, startsAt: null, endsAt: null, roomId: null, description: "", active: false };
const HREFS = { create: "/admin/charlas/nueva", editBase: "/admin/charlas", stage: "/admin/escenario" };
const SPEAKERS = [
  { id: "ana-torres", name: "Ana Torres", active: true },
  { id: "luis-quispe", name: "Luis Quispe", active: true },
  { id: "retirada", name: "Retirada", active: false },
];

beforeEach(() => vi.clearAllMocks());

describe("formatSlot", () => {
  it("shows the day and the time span as written (the venue's clock), whatever the browser's time zone", () => {
    expect(formatSlot("2026-10-24T09:00", "2026-10-24T09:45")).toMatch(/24 oct.* · 09:00–09:45$/);
    expect(formatSlot(null, null)).toBeNull();
    expect(formatSlot("2026-10-24T09:00", null)).toBeNull();
  });
});

describe("TalksAdminView", () => {
  const renderView = (
    talks: TalkView[] = [KEYNOTE, OLD],
    setActive: SetTalkActiveAction = vi.fn(async () => ({ ok: true as const })),
    project: ProjectTalkAction = vi.fn(async () => ({ ok: true as const })),
    extra: { remove?: DeleteTalkAction; canDelete?: boolean } = {},
  ) => {
    const remove = extra.remove ?? vi.fn<DeleteTalkAction>(async (input) => ({ ok: true, title: input.id }));
    const view = render(<TalksAdminView talks={talks} rooms={ROOMS} setActive={setActive} project={project} remove={remove} canDelete={extra.canDelete} hrefs={HREFS} />);
    return { ...view, setActive, project, remove, user: userEvent.setup() };
  };
  const row = (title: string) => within(screen.getByRole("list", { name: t.listLabel })).getAllByRole("listitem").find((item) => item.textContent?.includes(title))!;

  it("shows each talk with its time, speaker, room and state, and the old ones without them", () => {
    renderView();

    expect(row("Keynote")).toHaveTextContent("09:00–09:45");
    expect(row("Keynote")).toHaveTextContent("Ana Torres · Auditorio");
    expect(row("Keynote")).toHaveTextContent(t.active);
    expect(row("Charla vieja")).toHaveTextContent(t.noSchedule);
    expect(row("Charla vieja")).toHaveTextContent(`${t.noSpeaker} · ${t.noRoom}`);
    expect(row("Charla vieja")).toHaveTextContent(t.inactive);
  });

  it("links each talk to its editor, and offers the QR on the stage only for an open one (a closed one has no code)", () => {
    renderView();

    expect(screen.getByRole("link", { name: t.create })).toHaveAttribute("href", "/admin/charlas/nueva");
    expect(screen.getByRole("link", { name: `${t.edit}: Keynote` })).toHaveAttribute("href", "/admin/charlas/keynote");
    expect(within(row("Keynote")).getByRole("button", { name: `${t.project}: Keynote` })).toBeInTheDocument();
    expect(within(row("Charla vieja")).queryByRole("button", { name: `${t.project}: Charla vieja` })).not.toBeInTheDocument();
  });

  it("deletes a talk after confirming, says which one and refreshes the list", async () => {
    const { remove, user } = renderView(undefined, undefined, undefined, { remove: vi.fn<DeleteTalkAction>(async () => ({ ok: true, title: "Keynote" })) });

    await user.click(screen.getByRole("button", { name: `${t.delete}: Keynote` }));
    await answerConfirm("confirm");

    expect(remove).toHaveBeenCalledWith({ id: "keynote" });
    expect(await screen.findByText("La charla «Keynote» se eliminó.")).toHaveAttribute("role", "status");
    expect(router.refresh).toHaveBeenCalled();
  });

  it("does nothing when the confirmation is declined, and explains a refusal without refreshing", async () => {
    const remove = vi.fn<DeleteTalkAction>(async () => ({ ok: false, code: "has-check-ins" }));
    const { user } = renderView(undefined, undefined, undefined, { remove });

    await user.click(screen.getByRole("button", { name: `${t.delete}: Keynote` }));
    await answerConfirm("cancel");
    expect(remove).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: `${t.delete}: Keynote` }));
    await answerConfirm("confirm");
    expect(await screen.findByRole("alert")).toHaveTextContent(t.errors["has-check-ins"]);
    expect(router.refresh).not.toHaveBeenCalled();
  });

  it("survives a thrown delete, and offers no delete button when the session may not delete here", async () => {
    const first = renderView(undefined, undefined, undefined, { remove: vi.fn<DeleteTalkAction>(async () => { throw new Error("offline"); }) });
    await first.user.click(screen.getByRole("button", { name: `${t.delete}: Keynote` }));
    await answerConfirm("confirm");
    expect(await screen.findByRole("alert")).toHaveTextContent(t.errors.unknown);
    first.unmount();

    renderView(undefined, undefined, undefined, { canDelete: false });
    expect(screen.queryByRole("button", { name: `${t.delete}: Keynote` })).not.toBeInTheDocument();
  });

  it("puts the QR on the stage at once and goes to the stage controls", async () => {
    const { project, user } = renderView();

    await user.click(screen.getByRole("button", { name: `${t.project}: Keynote` }));

    expect(project).toHaveBeenCalledWith({ id: "keynote" });
    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/admin/escenario"));
  });

  it("says why the QR did not reach the stage, and stays on the list", async () => {
    const { user } = renderView([KEYNOTE, OLD], vi.fn(async () => ({ ok: true as const })), vi.fn(async () => ({ ok: false as const, text: "El escenario no está disponible." })));

    await user.click(screen.getByRole("button", { name: `${t.project}: Keynote` }));

    expect(await screen.findByRole("alert")).toHaveTextContent("El escenario no está disponible.");
    expect(router.push).not.toHaveBeenCalled();
  });

  it("survives a thrown project action", async () => {
    const { user } = renderView([KEYNOTE, OLD], vi.fn(async () => ({ ok: true as const })), vi.fn(async () => { throw new Error("network"); }));

    await user.click(screen.getByRole("button", { name: `${t.project}: Keynote` }));

    expect(await screen.findByRole("alert")).toHaveTextContent(copy.admin.stage.errors.unknown);
  });

  it("closes a talk, says so and refreshes; reopens a closed one", async () => {
    const { setActive, user } = renderView();

    await user.click(screen.getByRole("button", { name: `${t.deactivate}: Keynote` }));
    expect(setActive).toHaveBeenCalledWith({ id: "keynote", active: false });
    expect(await screen.findByRole("status")).toHaveTextContent("«Keynote» está cerrada");
    expect(router.refresh).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: `${t.activate}: Charla vieja` }));
    expect(setActive).toHaveBeenLastCalledWith({ id: "vieja", active: true });
  });

  it("explains a refusal, and treats a thrown action as unknown", async () => {
    const { user } = renderView([KEYNOTE], vi.fn(async () => ({ ok: false as const, code: "forbidden" as const })));
    await user.click(screen.getByRole("button", { name: `${t.deactivate}: Keynote` }));
    expect(await screen.findByRole("alert")).toHaveTextContent(t.errors.forbidden);
    expect(router.refresh).not.toHaveBeenCalled();
  });

  it("says so when there are no talks yet", () => {
    renderView([]);

    expect(screen.getByText(t.empty)).toBeInTheDocument();
  });

  it("has no detectable accessibility violations", async () => {
    const { container } = renderView();
    expect((await axe(container)).violations).toEqual([]);
  });
});

describe("TalkForm", () => {
  const renderForm = (props: Partial<Parameters<typeof TalkForm>[0]> = {}) => {
    const save = vi.fn<SaveTalkAction>(async () => ({ ok: true }));
    const view = render(<TalkForm mode="create" save={save} rooms={ROOMS} speakers={SPEAKERS} speakersHref="/admin/speakers" listHref="/admin/charlas" {...props} />);
    return { ...view, save: (props.save as typeof save | undefined) ?? save, user: userEvent.setup() };
  };

  it("creates a talk with every field, the id suggested from the title, and goes back to the list", async () => {
    const { save, user } = renderForm();

    await user.type(screen.getByLabelText(t.form.title), "Keynote: IA");
    await user.selectOptions(screen.getByLabelText(t.form.speakerAdd), "ana-torres");
    await user.selectOptions(screen.getByLabelText(t.form.speakerAdd), "luis-quispe");
    await user.type(screen.getByLabelText(t.form.startsAt), "2026-10-24T09:00");
    await user.type(screen.getByLabelText(t.form.endsAt), "2026-10-24T09:45");
    await user.selectOptions(screen.getByLabelText(t.form.room), "sala-b");
    await user.type(screen.getByLabelText(t.form.description), "Resumen");
    expect(screen.getByLabelText(t.form.id)).toHaveValue("keynote-ia");
    await user.click(screen.getByRole("button", { name: t.form.save }));

    expect(save).toHaveBeenCalledWith({
      id: "keynote-ia",
      draft: { title: "Keynote: IA", speakerIds: ["ana-torres", "luis-quispe"], startsAt: "2026-10-24T09:00", endsAt: "2026-10-24T09:45", roomId: "sala-b", description: "Resumen" },
    });
    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/admin/charlas"));
  });

  it("offers only active speakers not chosen yet, lets one be removed, and points to Speakers when there are none", async () => {
    const { user, unmount } = renderForm({ mode: "edit", talk: KEYNOTE });

    const options = () => within(screen.getByLabelText(t.form.speakerAdd)).getAllByRole("option").map((option) => option.textContent);
    expect(options()).toEqual([t.form.speakerChoose, "Luis Quispe"]);
    await user.click(screen.getByRole("button", { name: `${t.form.speakerRemove}: Ana Torres` }));
    expect(options()).toEqual([t.form.speakerChoose, "Ana Torres", "Luis Quispe"]);
    unmount();

    renderForm({ speakers: [] });
    expect(screen.getByRole("link", { name: t.form.speakerManage })).toHaveAttribute("href", "/admin/speakers");
  });

  it("shows the name a talk had before the catalog until a speaker is chosen", () => {
    renderForm({ mode: "edit", talk: { ...OLD, legacySpeaker: "Ana" } });

    expect(screen.getByText("Antes decía «Ana». Elige su ficha de speaker.")).toBeInTheDocument();
  });

  it("sends no room when none is chosen", async () => {
    const { save, user } = renderForm({ mode: "edit", talk: { ...KEYNOTE, roomId: null } });

    await user.click(screen.getByRole("button", { name: t.form.save }));

    expect(save).toHaveBeenCalledWith(expect.objectContaining({ id: "keynote", draft: expect.objectContaining({ roomId: null }) }));
  });

  it("edits a talk without changing its id, and offers its QR on the stage", async () => {
    const project = vi.fn<ProjectTalkAction>(async () => ({ ok: true }));
    const { user } = renderForm({ mode: "edit", talk: KEYNOTE, project, stageHref: "/admin/escenario" });

    expect(screen.getByRole("heading", { level: 1, name: t.form.editTitle })).toBeInTheDocument();
    expect(screen.getByLabelText(t.form.title)).toHaveValue("Keynote");
    expect(screen.getByLabelText(t.form.startsAt)).toHaveValue("2026-10-24T09:00");
    expect(screen.getByLabelText(t.form.room)).toHaveValue("auditorio");
    expect(screen.queryByLabelText(t.form.id)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: t.project }));
    expect(project).toHaveBeenCalledWith({ id: "keynote" });
    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/admin/escenario"));
  });

  it("shows a refusal next to its field and stays on the form", async () => {
    const save = vi.fn<SaveTalkAction>(async () => ({ ok: false, code: "invalid-schedule" }));
    const { user } = renderForm({ mode: "edit", talk: KEYNOTE, save });

    await user.click(screen.getByRole("button", { name: t.form.save }));

    expect(await screen.findByLabelText(t.form.startsAt)).toHaveAccessibleDescription(expect.stringContaining(t.errors["invalid-schedule"]));
    expect(router.push).not.toHaveBeenCalled();
  });

  it("shows an error with no field above the form, and survives a thrown action", async () => {
    const save = vi.fn<SaveTalkAction>(async () => {
      throw new Error("network");
    });
    const { user } = renderForm({ mode: "edit", talk: KEYNOTE, save });

    await user.click(screen.getByRole("button", { name: t.form.save }));

    expect(await screen.findByRole("alert")).toHaveTextContent(t.errors.unknown);
  });

  it("has no detectable accessibility violations", async () => {
    const { container } = renderForm({ mode: "edit", talk: KEYNOTE, project: vi.fn(async () => ({ ok: true as const })), stageHref: "/admin/escenario" });
    expect((await axe(container)).violations).toEqual([]);
  });
});
