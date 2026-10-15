// @vitest-environment jsdom
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { copy } from "@/shared/copy/es";
import { axe } from "@/test-utils/axe";
import type { SaveTalkAction, SetTalkActiveAction, TalkView } from "./admin-actions";
import { TalkForm } from "./TalkForm";
import { TalksAdminView, formatSlot } from "./TalksAdminView";

const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

const t = copy.admin.talks;
const ROOMS = [
  { id: "auditorio", name: "Auditorio" },
  { id: "sala-b", name: "Sala B" },
];
const KEYNOTE: TalkView = { id: "keynote", title: "Keynote", speaker: "Ana Torres", startsAt: "2026-10-24T09:00", endsAt: "2026-10-24T09:45", roomId: "auditorio", description: "", active: true };
const OLD: TalkView = { id: "vieja", title: "Charla vieja", speaker: null, startsAt: null, endsAt: null, roomId: null, description: "", active: false };
const HREFS = { create: "/admin/charlas/nueva", editBase: "/admin/charlas", projectBase: "/admin/qr" };

beforeEach(() => vi.clearAllMocks());

describe("formatSlot", () => {
  it("shows the day and the time span as written (the venue's clock), whatever the browser's time zone", () => {
    expect(formatSlot("2026-10-24T09:00", "2026-10-24T09:45")).toMatch(/24 oct.* · 09:00–09:45$/);
    expect(formatSlot(null, null)).toBeNull();
    expect(formatSlot("2026-10-24T09:00", null)).toBeNull();
  });
});

describe("TalksAdminView", () => {
  const renderView = (talks: TalkView[] = [KEYNOTE, OLD], setActive: SetTalkActiveAction = vi.fn(async () => ({ ok: true as const }))) => {
    const view = render(<TalksAdminView talks={talks} rooms={ROOMS} setActive={setActive} hrefs={HREFS} />);
    return { ...view, setActive, user: userEvent.setup() };
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

  it("links each talk to its editor, and an open one to its projected QR (a closed one has no code)", () => {
    renderView();

    expect(screen.getByRole("link", { name: t.create })).toHaveAttribute("href", "/admin/charlas/nueva");
    expect(screen.getByRole("link", { name: `${t.edit}: Keynote` })).toHaveAttribute("href", "/admin/charlas/keynote");
    expect(screen.getByRole("link", { name: `${t.project}: Keynote` })).toHaveAttribute("href", "/admin/qr/keynote");
    expect(screen.queryByRole("link", { name: `${t.project}: Charla vieja` })).not.toBeInTheDocument();
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
    const view = render(<TalkForm mode="create" save={save} rooms={ROOMS} listHref="/admin/charlas" {...props} />);
    return { ...view, save: (props.save as typeof save | undefined) ?? save, user: userEvent.setup() };
  };

  it("creates a talk with every field, the id suggested from the title, and goes back to the list", async () => {
    const { save, user } = renderForm();

    await user.type(screen.getByLabelText(t.form.title), "Keynote: IA");
    await user.type(screen.getByLabelText(t.form.speaker), "Ana Torres");
    await user.type(screen.getByLabelText(t.form.startsAt), "2026-10-24T09:00");
    await user.type(screen.getByLabelText(t.form.endsAt), "2026-10-24T09:45");
    await user.selectOptions(screen.getByLabelText(t.form.room), "sala-b");
    await user.type(screen.getByLabelText(t.form.description), "Resumen");
    expect(screen.getByLabelText(t.form.id)).toHaveValue("keynote-ia");
    await user.click(screen.getByRole("button", { name: t.form.save }));

    expect(save).toHaveBeenCalledWith({
      id: "keynote-ia",
      draft: { title: "Keynote: IA", speaker: "Ana Torres", startsAt: "2026-10-24T09:00", endsAt: "2026-10-24T09:45", roomId: "sala-b", description: "Resumen" },
    });
    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/admin/charlas"));
  });

  it("sends no room when none is chosen", async () => {
    const { save, user } = renderForm({ mode: "edit", talk: { ...KEYNOTE, roomId: null } });

    await user.click(screen.getByRole("button", { name: t.form.save }));

    expect(save).toHaveBeenCalledWith(expect.objectContaining({ id: "keynote", draft: expect.objectContaining({ roomId: null }) }));
  });

  it("edits a talk without changing its id, and offers its QR to project", async () => {
    renderForm({ mode: "edit", talk: KEYNOTE, qrHref: "/admin/qr/keynote" });

    expect(screen.getByRole("heading", { level: 1, name: t.form.editTitle })).toBeInTheDocument();
    expect(screen.getByLabelText(t.form.title)).toHaveValue("Keynote");
    expect(screen.getByLabelText(t.form.startsAt)).toHaveValue("2026-10-24T09:00");
    expect(screen.getByLabelText(t.form.room)).toHaveValue("auditorio");
    expect(screen.queryByLabelText(t.form.id)).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: t.project })).toHaveAttribute("href", "/admin/qr/keynote");
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
    const { container } = renderForm({ mode: "edit", talk: KEYNOTE, qrHref: "/admin/qr/keynote" });
    expect((await axe(container)).violations).toEqual([]);
  });
});
