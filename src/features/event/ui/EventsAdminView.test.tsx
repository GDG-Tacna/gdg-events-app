// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { copy } from "@/shared/copy/es";
import { axe } from "@/test-utils/axe";
import type { PublishEditionAction, SaveEditionAction, SetEditionStatusAction } from "./actions";
import { EventsAdminView, type EditionRow } from "./EventsAdminView";

const router = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

const t = copy.admin.events;
const NOW = "2026-10-20T12:00:00.000Z";
const LIVE: EditionRow = { id: "devfest-2026", name: "DevFest Tacna 2026", venue: "UNJBG", startsAt: "2026-10-24T14:00:00.000Z", endsAt: "2026-10-24T23:00:00.000Z", status: "draft", isPublic: true };
const NEXT: EditionRow = { id: "meetup-nov", name: "Meetup noviembre", venue: null, startsAt: null, endsAt: null, status: "draft", isPublic: false };
const OLD: EditionRow = { id: "devfest-2025", name: null, venue: null, startsAt: null, endsAt: "2025-10-25T23:00:00.000Z", status: "draft", isPublic: false };

function setup(props: Partial<Parameters<typeof EventsAdminView>[0]> = {}) {
  const actions = {
    create: vi.fn<SaveEditionAction>(async () => ({ ok: true })),
    update: vi.fn<SaveEditionAction>(async () => ({ ok: true })),
    setStatus: vi.fn<SetEditionStatusAction>(async () => ({ ok: true })),
    publish: vi.fn<PublishEditionAction>(async () => ({ ok: true })),
  };
  const view = render(<EventsAdminView editions={[LIVE, NEXT, OLD]} now={NOW} canManage {...actions} {...props} />);
  return { ...actions, ...view, user: userEvent.setup() };
}

const rows = () => within(screen.getByRole("list", { name: t.listLabel })).getAllByRole("listitem");

describe("EventsAdminView", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows each edition with its state, dates and place; an old one without a name shows its id", () => {
    setup();

    expect(rows()[0]).toHaveTextContent("DevFest Tacna 2026");
    expect(rows()[0]).toHaveTextContent(t.stage.live);
    expect(rows()[0]).toHaveTextContent("UNJBG");
    expect(rows()[0]).toHaveTextContent("24 oct. 2026, 9:00 a. m. – 24 oct. 2026, 6:00 p. m.");
    expect(rows()[1]).toHaveTextContent(t.stage.draft);
    expect(rows()[1]).toHaveTextContent(t.noDates);
    expect(rows()[2]).toHaveTextContent("devfest-2025");
    expect(rows()[2]).toHaveTextContent(t.stage.finished);
    expect(screen.queryByRole("button", { name: `${t.publish}: DevFest Tacna 2026` })).not.toBeInTheDocument();
  });

  it("creates an event with an id that follows the name until it is typed", async () => {
    const { create, user } = setup();

    await user.click(screen.getByRole("button", { name: t.create }));
    const dialog = screen.getByRole("dialog", { name: t.form.createTitle });
    await user.type(within(dialog).getByLabelText(t.form.name), "GDG Meetup Diciembre");
    expect(within(dialog).getByLabelText(t.form.id)).toHaveValue("gdg-meetup-diciembre");
    await user.type(within(dialog).getByLabelText(t.form.venue), "Auditorio");
    await user.click(within(dialog).getByRole("button", { name: t.form.save }));

    expect(create).toHaveBeenCalledWith({ id: "gdg-meetup-diciembre", draft: { name: "GDG Meetup Diciembre", venue: "Auditorio", startsAt: "", endsAt: "" } });
    expect(await screen.findByText("Listo: «GDG Meetup Diciembre» se creó como borrador.")).toHaveAttribute("role", "status");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(router.refresh).toHaveBeenCalled();
  });

  it("keeps the dialog open with the server's reason when saving is refused", async () => {
    const { user } = setup({ create: vi.fn<SaveEditionAction>(async () => ({ ok: false, code: "already-exists" })) });

    await user.click(screen.getByRole("button", { name: t.create }));
    await user.type(screen.getByLabelText(t.form.name), "Meetup noviembre");
    await user.click(screen.getByRole("button", { name: t.form.save }));

    expect(await within(screen.getByRole("dialog")).findByRole("alert")).toHaveTextContent(t.errors["already-exists"]);
  });

  it("edits an edition with its current details and dates in Lima time, without changing its id", async () => {
    const { update, user } = setup();

    await user.click(screen.getByRole("button", { name: `${t.edit}: DevFest Tacna 2026` }));
    const dialog = screen.getByRole("dialog", { name: t.form.editTitle });
    expect(within(dialog).queryByLabelText(t.form.id)).not.toBeInTheDocument();
    expect(within(dialog).getByLabelText(t.form.startsAt)).toHaveValue("2026-10-24T09:00");
    await user.click(within(dialog).getByRole("button", { name: t.form.save }));

    expect(update).toHaveBeenCalledWith({ id: "devfest-2026", draft: { name: "DevFest Tacna 2026", venue: "UNJBG", startsAt: "2026-10-24T09:00", endsAt: "2026-10-24T18:00" } });
  });

  it("asks before making an edition public, saying what changes, and can be cancelled", async () => {
    const { publish, user } = setup();

    await user.click(screen.getByRole("button", { name: `${t.publish}: Meetup noviembre` }));
    const dialog = screen.getByRole("dialog", { name: t.publishTitle });
    expect(dialog).toHaveTextContent("pasarán a «Meetup noviembre»");
    expect(dialog).toHaveTextContent("«DevFest Tacna 2026» conserva todos sus datos");
    await user.click(within(dialog).getByRole("button", { name: t.cancel }));
    expect(publish).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: `${t.publish}: Meetup noviembre` }));
    await user.click(screen.getByRole("button", { name: t.publishConfirm }));
    expect(publish).toHaveBeenCalledWith({ id: "meetup-nov" });
    expect(await screen.findByText("«Meetup noviembre» ya es el evento en curso.")).toBeInTheDocument();
  });

  it("finishes and reopens an edition", async () => {
    const { setStatus, user } = setup({ editions: [LIVE, { ...NEXT, status: "finished" }] });

    await user.click(screen.getByRole("button", { name: `${t.finish}: DevFest Tacna 2026` }));
    expect(setStatus).toHaveBeenCalledWith({ id: "devfest-2026", status: "finished" });
    await user.click(screen.getByRole("button", { name: `${t.reopen}: Meetup noviembre` }));
    expect(setStatus).toHaveBeenLastCalledWith({ id: "meetup-nov", status: "draft" });
  });

  it("opens the copy dialog for an edition, with the others as sources, only when copying is offered", async () => {
    const copyContent = vi.fn(async () => ({ ok: true as const, parts: ["squads" as const], documents: 1 }));
    const { user, unmount } = setup({ copyContent });

    await user.click(screen.getByRole("button", { name: `${t.copy.open}: Meetup noviembre` }));
    const dialog = screen.getByRole("dialog", { name: t.copy.title });
    expect(within(dialog).getAllByRole("option").map((option) => option.textContent)).toEqual([t.copy.chooseSource, "DevFest Tacna 2026", "devfest-2025"]);
    unmount();

    setup();
    expect(screen.queryByRole("button", { name: new RegExp(t.copy.open) })).not.toBeInTheDocument();
  });

  it("lets an organizer only edit: no create, finish or publish", () => {
    setup({ editions: [LIVE], canManage: false });

    expect(screen.getByText(t.subtitleOrganizer)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: t.create })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: `${t.finish}: DevFest Tacna 2026` })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: `${t.edit}: DevFest Tacna 2026` })).toBeInTheDocument();
  });

  it("has no detectable accessibility violations, with the list and with the form open", async () => {
    const { container, user } = setup();
    expect((await axe(container)).violations).toEqual([]);

    await user.click(screen.getByRole("button", { name: t.create }));
    expect((await axe(document.body)).violations).toEqual([]);
  });
});
