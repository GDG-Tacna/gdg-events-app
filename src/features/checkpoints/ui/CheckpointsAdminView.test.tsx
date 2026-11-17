// @vitest-environment jsdom
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { copy } from "@/shared/copy/es";
import { axe } from "@/test-utils/axe";
import { answerConfirm } from "@/test-utils/confirm";
import { CheckpointsAdminView } from "./CheckpointsAdminView";
import type { UploadImageAction } from "@/features/media";
import type { CheckpointLockReason, CheckpointView, CreateCheckpointAction, DeleteCheckpointAction, EditCheckpointAction, ManageActionResult, SetCheckpointActiveAction } from "./manage-action";

const router = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

const NONE = { minLevel: null, minTalks: null };
const PLAIN = { description: "", image: null };
const LUNCH: CheckpointView = { id: "lunch-1", kind: "catering", name: "Almuerzo", active: true, ...PLAIN, requirements: NONE };
const STAND: CheckpointView = { id: "stand-cloud", kind: "stand", name: "Stand Cloud", active: true, ...PLAIN, requirements: NONE };
const GATE: CheckpointView = { id: "entrance-main", kind: "entrance", name: "Entrada principal", active: false, ...PLAIN, requirements: NONE };
const LOGO = "public/e1/checkpoint/abcdef123456.webp";
const upload = vi.fn<UploadImageAction>(async () => ({ ok: true, image: { path: LOGO, url: `/media/${LOGO}`, width: 64, height: 64, format: "webp" } }));
const LEVELS = [
  { level: 1, name: "Recluta" },
  { level: 2, name: "Piloto" },
  { level: 3, name: "Comandante" },
];


function setup(
  checkpoints: CheckpointView[] = [LUNCH, STAND, GATE],
  results: Partial<Record<"create" | "edit" | "setActive", ManageActionResult>> = {},
  extra: { remove?: DeleteCheckpointAction; canDelete?: boolean; locks?: Record<string, CheckpointLockReason | null> } = {},
) {
  const create = vi.fn<CreateCheckpointAction>(async () => results.create ?? { ok: true, checkpoint: LUNCH });
  const edit = vi.fn<EditCheckpointAction>(async (input) => results.edit ?? { ok: true, checkpoint: { ...LUNCH, name: input.name } });
  const setActive = vi.fn<SetCheckpointActiveAction>(async () => results.setActive ?? { ok: true, checkpoint: { ...LUNCH, active: false } });
  const remove = extra.remove ?? vi.fn<DeleteCheckpointAction>(async (input) => ({ ok: true, name: input.id }));
  const view = render(
    <CheckpointsAdminView
      checkpoints={checkpoints}
      create={create}
      edit={edit}
      setActive={setActive}
      remove={remove}
      upload={upload}
      locks={extra.locks}
      canDelete={extra.canDelete}
      levels={LEVELS}
    />,
  );
  return { create, edit, setActive, remove, user: userEvent.setup(), ...view };
}

const row = (name: string) =>
  within(screen.getByRole("list", { name: copy.admin.checkpoints.listLabel }))
    .getAllByRole("listitem")
    .find((item) => item.textContent?.includes(name))!;

describe("CheckpointsAdminView list", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows each checkpoint with its kind and whether it is open", () => {
    setup();

    expect(row("Almuerzo")).toHaveTextContent(copy.admin.checkpoints.kinds.catering);
    expect(row("Almuerzo")).toHaveTextContent(copy.admin.checkpoints.open);
    expect(row("Entrada principal")).toHaveTextContent(copy.admin.checkpoints.closed);
    expect(row("Stand Cloud")).toHaveTextContent("stand-cloud");
  });

  it("links no station to any code: staff scan the cadet's QR there", () => {
    setup();

    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("says so when there are no checkpoints yet", () => {
    setup([]);

    expect(screen.getByText(copy.admin.checkpoints.empty)).toBeInTheDocument();
  });
});

describe("CheckpointsAdminView open and close", () => {
  beforeEach(() => vi.clearAllMocks());

  it("closes an open checkpoint, says which one, and refreshes the list", async () => {
    const { setActive, user } = setup();

    await user.click(screen.getByRole("button", { name: `${copy.admin.checkpoints.close}: Almuerzo` }));

    expect(setActive).toHaveBeenCalledWith({ id: "lunch-1", active: false });
    expect(await screen.findByRole("status")).toHaveTextContent("«Almuerzo» está cerrado: ya no acepta escaneos.");
    expect(router.refresh).toHaveBeenCalledTimes(1);
  });

  it("opens a closed one", async () => {
    const { setActive, user } = setup([GATE], { setActive: { ok: true, checkpoint: { ...GATE, active: true } } });

    await user.click(screen.getByRole("button", { name: `${copy.admin.checkpoints.reopen}: Entrada principal` }));

    expect(setActive).toHaveBeenCalledWith({ id: "entrance-main", active: true });
    expect(await screen.findByRole("status")).toHaveTextContent("«Entrada principal» está abierto.");
  });

  it("shows the server's reason when the change is refused, and does not refresh", async () => {
    const { user } = setup([LUNCH], { setActive: { ok: false, code: "not-found" } });

    await user.click(screen.getByRole("button", { name: `${copy.admin.checkpoints.close}: Almuerzo` }));

    expect(await screen.findByRole("alert")).toHaveTextContent(copy.admin.checkpoints.errors["not-found"]);
    expect(router.refresh).not.toHaveBeenCalled();
  });
});

describe("CheckpointsAdminView entrance code", () => {
  beforeEach(() => vi.clearAllMocks());

  const ENTRANCE: CheckpointView = { id: "entrada-norte", kind: "entrance", name: "Entrada norte", active: true, ...PLAIN, requirements: NONE };
  const render2 = (checkpoints: CheckpointView[], qrBase?: string) =>
    render(<CheckpointsAdminView checkpoints={checkpoints} create={vi.fn()} edit={vi.fn()} setActive={vi.fn()} remove={vi.fn()} upload={upload} qrBase={qrBase} levels={LEVELS} />);

  it("links an open entrance and an open stand to the screen that shows its code, each with its own label, and never a meal", () => {
    render2([ENTRANCE, LUNCH, STAND], "/admin/qr");

    expect(screen.getByRole("link", { name: `${copy.admin.checkpoints.showQr}: Entrada norte` })).toHaveAttribute("href", "/admin/qr/entrada-norte");
    expect(screen.getByRole("link", { name: `${copy.admin.checkpoints.showStandQr}: ${STAND.name}` })).toHaveAttribute("href", `/admin/qr/${STAND.id}`);
    expect(screen.getAllByRole("link")).toHaveLength(2);
  });

  it("leaves it out for a closed entrance or stand, and without a place to show the code", () => {
    const { unmount } = render2([{ ...ENTRANCE, active: false }, { ...STAND, active: false }], "/admin/qr");
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    unmount();

    render2([ENTRANCE]);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
});

describe("CheckpointsAdminView delete", () => {
  beforeEach(() => vi.clearAllMocks());

  it("deletes a station after confirming, says which one and refreshes the list", async () => {
    const { remove, user } = setup(undefined, undefined, { remove: vi.fn<DeleteCheckpointAction>(async () => ({ ok: true, name: "Almuerzo" })) });

    await user.click(screen.getByRole("button", { name: `${copy.admin.checkpoints.delete}: Almuerzo` }));
    await answerConfirm("confirm");

    expect(remove).toHaveBeenCalledWith({ id: "lunch-1" });
    expect(await screen.findByText("El puesto «Almuerzo» se eliminó.")).toHaveAttribute("role", "status");
    expect(router.refresh).toHaveBeenCalled();
  });

  it("does nothing when the confirmation is declined, and explains a refusal without refreshing", async () => {
    const remove = vi.fn<DeleteCheckpointAction>(async () => ({ ok: false, code: "has-check-ins" }));
    const { user } = setup(undefined, undefined, { remove });

    await user.click(screen.getByRole("button", { name: `${copy.admin.checkpoints.delete}: Almuerzo` }));
    await answerConfirm("cancel");
    expect(remove).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: `${copy.admin.checkpoints.delete}: Almuerzo` }));
    await answerConfirm("confirm");
    expect(await screen.findByRole("alert")).toHaveTextContent(copy.admin.checkpoints.errors["has-check-ins"]);
    expect(router.refresh).not.toHaveBeenCalled();
  });

  it("survives a thrown action, and offers no delete button when the session may not delete here", async () => {
    const { user, unmount } = setup(undefined, undefined, { remove: vi.fn<DeleteCheckpointAction>(async () => { throw new Error("offline"); }) });
    await user.click(screen.getByRole("button", { name: `${copy.admin.checkpoints.delete}: Almuerzo` }));
    await answerConfirm("confirm");
    expect(await screen.findByRole("alert")).toHaveTextContent(copy.admin.checkpoints.errors.unknown);
    unmount();

    setup(undefined, undefined, { canDelete: false });
    expect(screen.queryByRole("button", { name: `${copy.admin.checkpoints.delete}: Almuerzo` })).not.toBeInTheDocument();
  });
});

describe("CheckpointsAdminView create", () => {
  beforeEach(() => vi.clearAllMocks());
  /** The create form lives in a dialog opened from the header. */
  const setupCreate = async (...args: Parameters<typeof setup>) => {
    const t = setup(...args);
    await t.user.click(screen.getByRole("button", { name: copy.admin.checkpoints.createTitle }));
    return t;
  };

  const nameField = () => screen.getAllByLabelText(copy.admin.checkpoints.nameLabel).at(-1)!;
  const idField = () => screen.getByLabelText(copy.admin.checkpoints.idLabel);
  const submit = () => screen.getByRole("button", { name: copy.admin.checkpoints.create });

  it("suggests the id from the name while the admin types, and lets them change it", async () => {
    const { user } = await setupCreate();

    await user.type(nameField(), "Almuerzo día 2");
    expect(idField()).toHaveValue("almuerzo-dia-2");

    await user.clear(idField());
    await user.type(idField(), "lunch-2");
    await user.type(nameField(), "!");
    expect(idField()).toHaveValue("lunch-2");
  });

  it("starts with no kind selected and shows what each kind is for", async () => {
    await setupCreate();

    for (const radio of screen.getAllByRole("radio")) expect(radio).not.toBeChecked();
    expect(screen.getByText(copy.admin.checkpoints.kindHelp.stand)).toBeInTheDocument();
    // Talks are created in Charlas, with their speaker and schedule.
    expect(screen.queryByRole("radio", { name: new RegExp(copy.admin.checkpoints.kinds.talk) })).not.toBeInTheDocument();
    expect(screen.getAllByRole("radio")).toHaveLength(3);
  });

  it("checks the name and id on the client first and does not call the server", async () => {
    const { create, user } = await setupCreate();

    await user.type(nameField(), "x");
    await user.click(submit());

    expect(create).not.toHaveBeenCalled();
    expect(nameField()).toHaveAccessibleDescription(expect.stringContaining(copy.admin.checkpoints.errors["invalid-name"]));
  });

  it("asks for a kind instead of creating a meal by default", async () => {
    const { create, user } = await setupCreate();

    await user.type(nameField(), "Stand de Gemini");
    await user.click(submit());

    expect(create).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(copy.admin.checkpoints.kindRequired);
  });

  it("creates the checkpoint with the chosen kind, announces it, clears the form and refreshes", async () => {
    const { create, user } = await setupCreate();

    await user.type(nameField(), "Stand de Gemini");
    await user.click(screen.getByRole("radio", { name: new RegExp(copy.admin.checkpoints.kinds.stand) }));
    await user.click(submit());

    expect(create).toHaveBeenCalledWith({ name: "Stand de Gemini", id: "stand-de-gemini", kind: "stand", description: "", imagePath: null });
    expect(await screen.findByRole("status")).toHaveTextContent("Puesto «Almuerzo» creado y abierto.");
    expect(router.refresh).toHaveBeenCalledTimes(1);
    // The dialog closes; opened again, its form starts empty.
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: copy.admin.checkpoints.createTitle }));
    expect(nameField()).toHaveValue("");
  });

  it("explains a taken id and keeps what was typed", async () => {
    const { user } = await setupCreate([LUNCH], { create: { ok: false, code: "already-exists" } });

    await user.type(nameField(), "Almuerzo");
    await user.click(screen.getByRole("radio", { name: new RegExp(copy.admin.checkpoints.kinds.catering) }));
    await user.click(submit());

    expect(await screen.findByRole("alert")).toHaveTextContent(copy.admin.checkpoints.errors["already-exists"]);
    expect(nameField()).toHaveValue("Almuerzo");
    expect(router.refresh).not.toHaveBeenCalled();
  });

  it("blocks the form while the change is in flight", async () => {
    let finish!: (value: ManageActionResult) => void;
    const create = vi.fn<CreateCheckpointAction>(() => new Promise((resolve) => (finish = resolve)));
    render(<CheckpointsAdminView checkpoints={[]} create={create} edit={vi.fn()} setActive={vi.fn()} remove={vi.fn()} upload={upload} levels={LEVELS} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: copy.admin.checkpoints.createTitle }));

    await user.type(screen.getAllByLabelText(copy.admin.checkpoints.nameLabel)[0], "Almuerzo");
    await user.click(screen.getByRole("radio", { name: new RegExp(copy.admin.checkpoints.kinds.catering) }));
    await user.click(screen.getByRole("button", { name: copy.admin.checkpoints.create }));

    expect(screen.getByRole("button", { name: copy.admin.checkpoints.creating })).toBeDisabled();
    finish({ ok: true, checkpoint: LUNCH });
    expect(await screen.findByRole("status")).toBeInTheDocument();
  });
});

describe("CheckpointsAdminView accessibility", () => {
  it("has no detectable violations, with checkpoints and with the edit dialog open", async () => {
    const { container, user } = setup();
    expect((await axe(container)).violations).toEqual([]);

    await user.click(screen.getByRole("button", { name: `${copy.admin.checkpoints.edit.action}: Almuerzo` }));
    expect((await axe(container)).violations).toEqual([]);
  });
});

describe("CheckpointsAdminView description and image", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows each puesto's image and description on its row", () => {
    const { container } = setup([{ ...STAND, description: "Impresión 3D en vivo", image: { path: LOGO, url: `/media/${LOGO}` } }]);

    expect(row("Stand Cloud")).toHaveTextContent("Impresión 3D en vivo");
    expect(container.querySelector(`img[src="/media/${LOGO}"]`)).not.toBeNull();
  });

  it("creates a puesto with its description and the uploaded image", async () => {
    const { create, user } = setup();
    await user.click(screen.getByRole("button", { name: copy.admin.checkpoints.createTitle }));

    await user.type(screen.getAllByLabelText(copy.admin.checkpoints.nameLabel)[0], "Louis 3D");
    await user.click(screen.getByRole("radio", { name: new RegExp(copy.admin.checkpoints.kinds.stand) }));
    await user.type(screen.getByLabelText(copy.admin.checkpoints.descriptionLabel), "Impresión 3D");
    fireEvent.change(screen.getByTestId("image-input-checkpoint"), { target: { files: [new File([new Uint8Array(10)], "logo.png", { type: "image/png" })] } });
    await screen.findByText(copy.common.image.uploaded);
    await user.click(screen.getByRole("button", { name: copy.admin.checkpoints.create }));

    expect(upload).toHaveBeenCalled();
    expect(create).toHaveBeenCalledWith({ name: "Louis 3D", id: "louis-3d", kind: "stand", description: "Impresión 3D", imagePath: LOGO });
  });
});

describe("CheckpointsAdminView edit", () => {
  const t = copy.admin.checkpoints;
  beforeEach(() => vi.clearAllMocks());

  const open = async (user: ReturnType<typeof userEvent.setup>, name = "Almuerzo") => user.click(screen.getByRole("button", { name: `${t.edit.action}: ${name}` }));
  const dialog = () => within(screen.getByRole("dialog"));
  const save = () => dialog().getByRole("button", { name: t.save });

  it("offers Editar instead of renaming or a separate requirements dialog", () => {
    setup();

    expect(screen.getByRole("button", { name: `${t.edit.action}: Stand Cloud` })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Renombrar|Requisitos/ })).not.toBeInTheDocument();
  });

  it("opens with the saved values and sends only what can change: name, description", async () => {
    const { edit, user } = setup([{ ...STAND, description: "Nube" }]);
    await open(user, "Stand Cloud");

    expect(dialog().getByLabelText(t.nameLabel)).toHaveValue("Stand Cloud");
    expect(dialog().getByLabelText(t.idLabel)).toHaveValue("stand-cloud");
    expect(dialog().getByRole("radio", { name: new RegExp(t.kinds.stand) })).toBeChecked();
    await user.clear(dialog().getByLabelText(t.nameLabel));
    await user.type(dialog().getByLabelText(t.nameLabel), "Stand Nube");
    await user.clear(dialog().getByLabelText(t.descriptionLabel));
    await user.type(dialog().getByLabelText(t.descriptionLabel), "Todo sobre la nube");
    await user.click(save());

    expect(edit).toHaveBeenCalledWith({ id: "stand-cloud", name: "Stand Nube", description: "Todo sobre la nube" });
    expect(await screen.findByRole("status")).toHaveTextContent("Puesto «Stand Nube» guardado.");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(router.refresh).toHaveBeenCalledTimes(1);
  });

  it("sends a new kind and id when the puesto is free to change them", async () => {
    const { edit, user } = setup([STAND]);
    await open(user, "Stand Cloud");

    await user.clear(dialog().getByLabelText(t.idLabel));
    await user.type(dialog().getByLabelText(t.idLabel), "entrada-sur");
    await user.click(dialog().getByRole("radio", { name: new RegExp(t.kinds.entrance) }));
    await user.click(save());

    expect(edit).toHaveBeenCalledWith({ id: "stand-cloud", name: "Stand Cloud", description: "", kind: "entrance", newId: "entrada-sur" });
  });

  it("removes the image", async () => {
    const { edit, user } = setup([{ ...STAND, image: { path: LOGO, url: `/media/${LOGO}` } }]);
    await open(user, "Stand Cloud");

    await user.click(dialog().getByRole("button", { name: copy.common.image.remove }));
    await user.click(save());

    expect(edit).toHaveBeenCalledWith({ id: "stand-cloud", name: "Stand Cloud", description: "", imagePath: null });
  });

  it.each([
    ["from-plan", "Este stand viene del plano: se cambia desde Zonas."],
    ["has-check-ins", "Ya tiene check-ins"],
    ["has-missions", "Una misión lo usa"],
    ["edition-locked", "La edición ya está publicada"],
  ] as const)("locks the kind and id with the reason when %s, and still saves the rest", async (lock, reason) => {
    const { edit, user } = setup([STAND], {}, { locks: { "stand-cloud": lock } });
    await open(user, "Stand Cloud");

    expect(dialog().getByLabelText(t.idLabel)).toBeDisabled();
    for (const radio of dialog().getAllByRole("radio")) expect(radio).toBeDisabled();
    expect(dialog().getAllByText(new RegExp(reason)).length).toBeGreaterThan(0);
    await user.click(save());

    expect(edit).toHaveBeenCalledWith({ id: "stand-cloud", name: "Stand Cloud", description: "" });
  });

  it("says a lock the server found as a lock, and keeps the dialog open", async () => {
    const { user } = setup([STAND], { edit: { ok: false, code: "has-missions" } });
    await open(user, "Stand Cloud");

    await user.click(dialog().getByRole("radio", { name: new RegExp(t.kinds.entrance) }));
    await user.click(save());

    expect(await dialog().findByRole("alert")).toHaveTextContent(t.edit.locks["has-missions"]);
    expect(router.refresh).not.toHaveBeenCalled();
  });

  it("checks the name and id on the client, and cancels without calling the server", async () => {
    const { edit, user } = setup([STAND]);
    await open(user, "Stand Cloud");

    await user.clear(dialog().getByLabelText(t.idLabel));
    await user.type(dialog().getByLabelText(t.idLabel), "No Valid");
    await user.click(save());
    expect(edit).not.toHaveBeenCalled();
    expect(dialog().getByLabelText(t.idLabel)).toHaveAccessibleDescription(expect.stringContaining(t.errors["invalid-id"]));

    await user.click(dialog().getByRole("button", { name: t.cancel }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(edit).not.toHaveBeenCalled();
  });
});

describe("CheckpointsAdminView food gates", () => {
  const r = copy.admin.checkpoints.requirements;
  const t = copy.admin.checkpoints;
  beforeEach(() => vi.clearAllMocks());

  const open = async (user: ReturnType<typeof userEvent.setup>, name = "Almuerzo") => user.click(screen.getByRole("button", { name: `${t.edit.action}: ${name}` }));
  const editor = () => within(screen.getByRole("group", { name: r.title }));
  const save = () => within(screen.getByRole("dialog")).getByRole("button", { name: t.save });

  it("shows what each meal asks for", () => {
    const coffee: CheckpointView = { ...LUNCH, id: "coffee-1", name: "Coffee break" };
    const gated: CheckpointView = { ...LUNCH, requirements: { minLevel: 2, minTalks: 3 } };
    const talksOnly: CheckpointView = { ...LUNCH, id: "dinner-1", name: "Cena", requirements: { minLevel: null, minTalks: 1 } };
    setup([gated, coffee, talksOnly, STAND]);

    expect(row("Almuerzo")).toHaveTextContent("Desde Piloto (NV 2) · 3 charlas asistidas");
    expect(row("Coffee break")).toHaveTextContent(r.none);
    expect(row("Cena")).toHaveTextContent(r.talksOne);
    expect(row("Cena")).not.toHaveTextContent("Desde");
    expect(row("Stand Cloud")).not.toHaveTextContent(r.none);
  });

  it("edits a meal's minimum level from the ladder and a minimum of talks in the edit dialog", async () => {
    const { user, edit } = setup();
    await open(user);

    const levels = within(editor().getByLabelText(r.levelLabel)).getAllByRole("option").map((option) => option.textContent);
    expect(levels).toEqual([r.levelNone, "Piloto (NV 2)", "Comandante (NV 3)"]);
    await user.selectOptions(editor().getByLabelText(r.levelLabel), "2");
    await user.type(editor().getByLabelText(r.talksLabel), "3x");
    await user.click(save());

    expect(edit).toHaveBeenCalledWith({ id: "lunch-1", name: "Almuerzo", description: "", requirements: { minLevel: 2, minTalks: 3 } });
    expect(router.refresh).toHaveBeenCalled();
  });

  it("opens with the saved values, and clears them as no condition", async () => {
    const { user, edit } = setup([{ ...LUNCH, requirements: { minLevel: 3, minTalks: 2 } }]);
    await open(user);

    expect(editor().getByLabelText(r.levelLabel)).toHaveValue("3");
    expect(editor().getByLabelText(r.talksLabel)).toHaveValue("2");
    await user.selectOptions(editor().getByLabelText(r.levelLabel), "");
    await user.clear(editor().getByLabelText(r.talksLabel));
    await user.click(save());

    expect(edit).toHaveBeenCalledWith(expect.objectContaining({ requirements: { minLevel: null, minTalks: null } }));
  });

  it("keeps a saved level the ladder no longer has", async () => {
    const { user } = setup([{ ...LUNCH, requirements: { minLevel: 5, minTalks: null } }]);

    expect(row("Almuerzo")).toHaveTextContent("Desde NV 5");
    await open(user);
    expect(editor().getByLabelText(r.levelLabel)).toHaveValue("5");
  });

  it("will not send too many talks", async () => {
    const { user, edit } = setup();
    await open(user);

    await user.type(editor().getByLabelText(r.talksLabel), "51");
    await user.click(save());

    expect(editor().getByLabelText(r.talksLabel)).toHaveAccessibleDescription(expect.stringContaining(t.errors["invalid-talks"]));
    expect(edit).not.toHaveBeenCalled();
  });

  it("drops the requirements when the meal becomes another kind, and says so", async () => {
    const { user, edit } = setup([{ ...LUNCH, requirements: { minLevel: 2, minTalks: null } }]);
    await open(user);

    await user.click(within(screen.getByRole("dialog")).getByRole("radio", { name: new RegExp(t.kinds.stand) }));
    expect(screen.queryByRole("group", { name: r.title })).not.toBeInTheDocument();
    expect(screen.getByText(t.edit.requirementsDropped)).toBeInTheDocument();
    await user.click(save());

    expect(edit).toHaveBeenCalledWith({ id: "lunch-1", name: "Almuerzo", description: "", kind: "stand" });
  });

  it("has no detectable violations with the editor open", async () => {
    const { container, user } = setup();
    await open(user);

    expect((await axe(container)).violations).toEqual([]);
  });
});
