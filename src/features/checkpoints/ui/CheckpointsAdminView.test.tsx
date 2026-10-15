// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { copy } from "@/shared/copy/es";
import { axe } from "@/test-utils/axe";
import { CheckpointsAdminView } from "./CheckpointsAdminView";
import type { CheckpointView, CreateCheckpointAction, ManageActionResult, RenameCheckpointAction, SetCheckpointActiveAction, SetFoodRequirementsAction } from "./manage-action";

const router = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

const NONE = { minLevel: null, minTalks: null };
const LUNCH: CheckpointView = { id: "lunch-1", kind: "catering", name: "Almuerzo", active: true, requirements: NONE };
const STAND: CheckpointView = { id: "stand-cloud", kind: "stand", name: "Stand Cloud", active: true, requirements: NONE };
const GATE: CheckpointView = { id: "entrance-main", kind: "entrance", name: "Entrada principal", active: false, requirements: NONE };
const LEVELS = [
  { level: 1, name: "Recluta" },
  { level: 2, name: "Piloto" },
  { level: 3, name: "Comandante" },
];


function setup(checkpoints: CheckpointView[] = [LUNCH, STAND, GATE], results: Partial<Record<"create" | "rename" | "setActive" | "setRequirements", ManageActionResult>> = {}) {
  const create = vi.fn<CreateCheckpointAction>(async () => results.create ?? { ok: true, checkpoint: LUNCH });
  const rename = vi.fn<RenameCheckpointAction>(async () => results.rename ?? { ok: true, checkpoint: { ...LUNCH, name: "Nuevo" } });
  const setActive = vi.fn<SetCheckpointActiveAction>(async () => results.setActive ?? { ok: true, checkpoint: { ...LUNCH, active: false } });
  const setRequirements = vi.fn<SetFoodRequirementsAction>(async (input) => results.setRequirements ?? { ok: true, checkpoint: { ...LUNCH, requirements: { minLevel: input.minLevel, minTalks: input.minTalks } } });
  const view = render(
    <CheckpointsAdminView checkpoints={checkpoints} create={create} rename={rename} setActive={setActive} setRequirements={setRequirements} levels={LEVELS} />,
  );
  return { create, rename, setActive, setRequirements, user: userEvent.setup(), ...view };
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

describe("CheckpointsAdminView rename", () => {
  beforeEach(() => vi.clearAllMocks());

  it("edits the name in place, saves it and refreshes", async () => {
    const { rename, user } = setup();

    await user.click(screen.getByRole("button", { name: `${copy.admin.checkpoints.rename}: Almuerzo` }));
    const field = screen.getAllByLabelText(copy.admin.checkpoints.nameLabel)[0];
    expect(field).toHaveValue("Almuerzo");
    await user.clear(field);
    await user.type(field, "Almuerzo día 1");
    await user.click(screen.getByRole("button", { name: copy.admin.checkpoints.save }));

    expect(rename).toHaveBeenCalledWith({ id: "lunch-1", name: "Almuerzo día 1" });
    expect(await screen.findByRole("status")).toHaveTextContent("Ahora se llama «Nuevo».");
    expect(router.refresh).toHaveBeenCalledTimes(1);
  });

  it("can be cancelled without calling the server", async () => {
    const { rename, user } = setup();

    await user.click(screen.getByRole("button", { name: `${copy.admin.checkpoints.rename}: Almuerzo` }));
    await user.click(screen.getByRole("button", { name: copy.admin.checkpoints.cancel }));

    expect(rename).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: copy.admin.checkpoints.save })).not.toBeInTheDocument();
  });

  it("keeps the editor open and explains when the name is refused", async () => {
    const { user } = setup([LUNCH], { rename: { ok: false, code: "invalid-name" } });

    await user.click(screen.getByRole("button", { name: `${copy.admin.checkpoints.rename}: Almuerzo` }));
    await user.click(screen.getByRole("button", { name: copy.admin.checkpoints.save }));

    expect(await screen.findByRole("alert")).toHaveTextContent(copy.admin.checkpoints.errors["invalid-name"]);
    expect(screen.getByRole("button", { name: copy.admin.checkpoints.save })).toBeInTheDocument();
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

  it("starts with catering selected and shows what each kind is for", async () => {
    await setupCreate();

    expect(screen.getByRole("radio", { name: new RegExp(copy.admin.checkpoints.kinds.catering) })).toBeChecked();
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

  it("creates the checkpoint with the chosen kind, announces it, clears the form and refreshes", async () => {
    const { create, user } = await setupCreate();

    await user.type(nameField(), "Stand de Gemini");
    await user.click(screen.getByRole("radio", { name: new RegExp(copy.admin.checkpoints.kinds.stand) }));
    await user.click(submit());

    expect(create).toHaveBeenCalledWith({ name: "Stand de Gemini", id: "stand-de-gemini", kind: "stand" });
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
    await user.click(submit());

    expect(await screen.findByRole("alert")).toHaveTextContent(copy.admin.checkpoints.errors["already-exists"]);
    expect(nameField()).toHaveValue("Almuerzo");
    expect(router.refresh).not.toHaveBeenCalled();
  });

  it("blocks the form while the change is in flight", async () => {
    let finish!: (value: ManageActionResult) => void;
    const create = vi.fn<CreateCheckpointAction>(() => new Promise((resolve) => (finish = resolve)));
    render(<CheckpointsAdminView checkpoints={[]} create={create} rename={vi.fn()} setActive={vi.fn()} setRequirements={vi.fn()} levels={LEVELS} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: copy.admin.checkpoints.createTitle }));

    await user.type(screen.getAllByLabelText(copy.admin.checkpoints.nameLabel)[0], "Almuerzo");
    await user.click(screen.getByRole("button", { name: copy.admin.checkpoints.create }));

    expect(screen.getByRole("button", { name: copy.admin.checkpoints.creating })).toBeDisabled();
    finish({ ok: true, checkpoint: LUNCH });
    expect(await screen.findByRole("status")).toBeInTheDocument();
  });
});

describe("CheckpointsAdminView accessibility", () => {
  it("has no detectable violations, with checkpoints and with a rename open", async () => {
    const { container, user } = setup();
    expect((await axe(container)).violations).toEqual([]);

    await user.click(screen.getByRole("button", { name: `${copy.admin.checkpoints.rename}: Almuerzo` }));
    expect((await axe(container)).violations).toEqual([]);
  });
});

describe("CheckpointsAdminView food gates", () => {
  const r = copy.admin.checkpoints.requirements;
  beforeEach(() => vi.clearAllMocks());

  const open = async (user: ReturnType<typeof userEvent.setup>, name = "Almuerzo") => user.click(screen.getByRole("button", { name: `${r.edit}: ${name}` }));
  const editor = () => within(screen.getByRole("group", { name: r.title }));

  it("shows what each meal asks for, and offers the requirements only on meals", () => {
    const coffee: CheckpointView = { ...LUNCH, id: "coffee-1", name: "Coffee break" };
    const gated: CheckpointView = { ...LUNCH, requirements: { minLevel: 2, minTalks: 3 } };
    const talksOnly: CheckpointView = { ...LUNCH, id: "dinner-1", name: "Cena", requirements: { minLevel: null, minTalks: 1 } };
    setup([gated, coffee, talksOnly, STAND]);

    expect(row("Almuerzo")).toHaveTextContent("Desde Piloto (NV 2) · 3 charlas asistidas");
    expect(row("Coffee break")).toHaveTextContent(r.none);
    expect(row("Cena")).toHaveTextContent(r.talksOne);
    expect(row("Cena")).not.toHaveTextContent("Desde");
    expect(row("Stand Cloud")).not.toHaveTextContent(r.none);
    expect(screen.queryByRole("button", { name: `${r.edit}: Stand Cloud` })).not.toBeInTheDocument();
  });

  it("saves a minimum level from the ladder and a minimum of talks", async () => {
    const { user, setRequirements } = setup();
    await open(user);

    const levels = within(editor().getByLabelText(r.levelLabel)).getAllByRole("option").map((option) => option.textContent);
    expect(levels).toEqual([r.levelNone, "Piloto (NV 2)", "Comandante (NV 3)"]);
    await user.selectOptions(editor().getByLabelText(r.levelLabel), "2");
    await user.type(editor().getByLabelText(r.talksLabel), "3x");
    await user.click(editor().getByRole("button", { name: r.save }));

    expect(setRequirements).toHaveBeenCalledWith({ id: "lunch-1", minLevel: 2, minTalks: 3 });
    expect(await screen.findByRole("status")).toHaveTextContent("Requisitos de «Almuerzo» guardados.");
    expect(screen.queryByRole("group", { name: r.title })).not.toBeInTheDocument();
    expect(router.refresh).toHaveBeenCalled();
  });

  it("opens with the saved values, and clears them as no condition", async () => {
    const { user, setRequirements } = setup([{ ...LUNCH, requirements: { minLevel: 3, minTalks: 2 } }]);
    await open(user);

    expect(editor().getByLabelText(r.levelLabel)).toHaveValue("3");
    expect(editor().getByLabelText(r.talksLabel)).toHaveValue("2");
    await user.selectOptions(editor().getByLabelText(r.levelLabel), "");
    await user.clear(editor().getByLabelText(r.talksLabel));
    await user.click(editor().getByRole("button", { name: r.save }));

    expect(setRequirements).toHaveBeenCalledWith({ id: "lunch-1", minLevel: null, minTalks: null });
  });

  it("keeps a saved level the ladder no longer has", async () => {
    const { user } = setup([{ ...LUNCH, requirements: { minLevel: 5, minTalks: null } }]);

    expect(row("Almuerzo")).toHaveTextContent("Desde NV 5");
    await open(user);
    expect(editor().getByLabelText(r.levelLabel)).toHaveValue("5");
  });

  it("will not send too many talks, keeps the editor open on a refusal, and cancels without saving", async () => {
    const { user, setRequirements } = setup(undefined, { setRequirements: { ok: false, code: "not-catering" } });
    await open(user);

    await user.type(editor().getByLabelText(r.talksLabel), "51");
    await user.click(editor().getByRole("button", { name: r.save }));
    expect(editor().getByLabelText(r.talksLabel)).toHaveAccessibleDescription(expect.stringContaining(copy.admin.checkpoints.errors["invalid-talks"]));
    expect(setRequirements).not.toHaveBeenCalled();

    await user.clear(editor().getByLabelText(r.talksLabel));
    await user.type(editor().getByLabelText(r.talksLabel), "50");
    await user.click(editor().getByRole("button", { name: r.save }));
    expect(await screen.findByRole("alert")).toHaveTextContent(copy.admin.checkpoints.errors["not-catering"]);
    expect(screen.getByRole("group", { name: r.title })).toBeInTheDocument();

    await user.click(editor().getByRole("button", { name: copy.admin.checkpoints.cancel }));
    expect(screen.queryByRole("group", { name: r.title })).not.toBeInTheDocument();
    expect(router.refresh).not.toHaveBeenCalled();
  });

  it("has no detectable violations with the editor open", async () => {
    const { container, user } = setup();
    await open(user);

    expect((await axe(container)).violations).toEqual([]);
  });
});
