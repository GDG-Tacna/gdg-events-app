// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { copy } from "@/shared/copy/es";
import { axe } from "@/test-utils/axe";
import type { Speaker } from "../domain/speaker";
import type { SaveSpeakerAction, SetSpeakerActiveAction } from "./actions";
import { SpeakersAdminView } from "./SpeakersAdminView";

const router = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

const t = copy.admin.speakers;
const ANA: Speaker = {
  id: "ana-torres",
  name: "Ana Torres",
  headline: "GDE Firebase",
  bio: "Construye apps.",
  photo: null,
  links: { linkedin: "https://linkedin.com/in/ana", github: null, web: null },
  active: true,
};

function setup(speakers: Speaker[] = [ANA]) {
  const actions = {
    create: vi.fn<SaveSpeakerAction>(async () => ({ ok: true })),
    update: vi.fn<SaveSpeakerAction>(async () => ({ ok: true })),
    setActive: vi.fn<SetSpeakerActiveAction>(async () => ({ ok: true })),
  };
  const view = render(<SpeakersAdminView speakers={speakers} {...actions} upload={vi.fn()} qrBase="/admin/speakers" />);
  return { ...actions, ...view, user: userEvent.setup() };
}

describe("SpeakersAdminView", () => {
  beforeEach(() => vi.clearAllMocks());

  it("lists each speaker with their role and state, and says when there are none", () => {
    const { unmount } = setup([ANA, { ...ANA, id: "zoe", name: "Zoe", active: false }]);
    const items = within(screen.getByRole("list", { name: t.listLabel })).getAllByRole("listitem");

    expect(items[0]).toHaveTextContent("Ana Torres");
    expect(items[0]).toHaveTextContent("GDE Firebase");
    expect(items[1]).toHaveTextContent(t.inactive);
    unmount();

    setup([]);
    expect(screen.getByText(t.empty)).toBeInTheDocument();
  });

  it("links to an active speaker's code, and not to an inactive one's", () => {
    setup([ANA, { ...ANA, id: "zoe", name: "Zoe", active: false }]);

    expect(screen.getByRole("link", { name: `${t.showQr}: Ana Torres` })).toHaveAttribute("href", "/admin/speakers/ana-torres/qr");
    expect(screen.queryByRole("link", { name: `${t.showQr}: Zoe` })).not.toBeInTheDocument();
  });

  it("adds a speaker with an id from the name and the links, without a photo", async () => {
    const { create, user } = setup([]);

    await user.click(screen.getByRole("button", { name: t.create }));
    const dialog = screen.getByRole("dialog", { name: t.form.createTitle });
    await user.type(within(dialog).getByLabelText(t.form.name), "Luis Quispe");
    expect(within(dialog).getByLabelText(t.form.id)).toHaveValue("luis-quispe");
    await user.type(within(dialog).getByLabelText(t.form.github), "https://github.com/luis");
    await user.click(within(dialog).getByRole("button", { name: t.form.save }));

    expect(create).toHaveBeenCalledWith({
      id: "luis-quispe",
      draft: { name: "Luis Quispe", headline: "", bio: "", links: { linkedin: "", github: "https://github.com/luis", web: "" } },
      photoPath: null,
    });
    expect(await screen.findByText("«Luis Quispe» se agregó.")).toHaveAttribute("role", "status");
  });

  it("edits a speaker keeping the photo untouched, and shows a refusal inside the dialog", async () => {
    const { update, user } = setup();

    await user.click(screen.getByRole("button", { name: `${t.edit}: Ana Torres` }));
    const dialog = screen.getByRole("dialog", { name: t.form.editTitle });
    expect(within(dialog).queryByLabelText(t.form.id)).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: t.form.save }));
    expect(update).toHaveBeenCalledWith({ id: "ana-torres", draft: expect.objectContaining({ name: "Ana Torres", links: { linkedin: "https://linkedin.com/in/ana", github: "", web: "" } }) });
    expect(update.mock.calls[0][0]).not.toHaveProperty("photoPath");

    update.mockResolvedValueOnce({ ok: false, code: "invalid-link" });
    await user.click(screen.getByRole("button", { name: `${t.edit}: Ana Torres` }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: t.form.save }));
    expect(await within(screen.getByRole("dialog")).findByRole("alert")).toHaveTextContent(t.errors["invalid-link"]);
  });

  it("stops offering a speaker and says what that means", async () => {
    const { setActive, user } = setup();

    await user.click(screen.getByRole("button", { name: `${t.deactivate}: Ana Torres` }));

    expect(setActive).toHaveBeenCalledWith({ id: "ana-torres", active: false });
    expect(await screen.findByText("«Ana Torres» ya no se ofrece para charlas nuevas; las que lo tienen lo conservan.")).toBeInTheDocument();
  });

  it("has no detectable accessibility violations, with the list and with the form open", async () => {
    const { container, user } = setup();
    expect((await axe(container)).violations).toEqual([]);

    await user.click(screen.getByRole("button", { name: t.create }));
    expect((await axe(document.body)).violations).toEqual([]);
  });
});
