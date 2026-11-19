import { beforeEach, describe, expect, it, vi } from "vitest";
import { err, ok, type Result } from "@/shared/lib/result";
import type { RecordImages } from "@/features/media/constants";
import {
  createCheckpoint,
  deleteCheckpoint,
  editCheckpoint,
  listCheckpoints,
  listIdentityLocks,
  normalizeDescription,
  normalizeName,
  setCheckpointActive,
  suggestId,
  type CheckpointDeletion,
  type CheckpointStore,
  type ManageActor,
  type ManageAudit,
  type ManageDeps,
  type ManagedCheckpoint,
} from "./manage";
import { manageError } from "./manage-error";

const NOW = new Date("2026-10-20T13:00:00Z");
const ADMIN: ManageActor = { uid: "a1", role: "admin" };
const NONE = { minLevel: null, minTalks: null, minTicket: null };
const LUNCH: ManagedCheckpoint = { id: "lunch-1", kind: "catering", name: "Almuerzo", active: true, description: "", image: null, requirements: NONE };
const LOGO = "public/e1/checkpoint/abcdef123456.webp";
const LOGO_REF = { path: LOGO, url: `/media/${LOGO}` };

type Saved = Result<{ before: ManagedCheckpoint; after: ManagedCheckpoint } | null, { code: "has-check-ins" | "has-missions" | "already-exists" | "unknown" }>;

interface Setup {
  list?: Result<readonly ManagedCheckpoint[], { code: string }>;
  create?: Result<void, { code: "already-exists" | "unknown" }>;
  update?: Saved;
  rekey?: Saved;
  remove?: Result<CheckpointDeletion, { code: string }>;
  usage?: Result<Readonly<Record<string, { checkIns: boolean; missions: boolean }>>, { code: string }>;
  planned?: Result<readonly string[], { code: string }>;
  auditFails?: boolean;
}

function setup({
  list = ok([LUNCH]),
  create = ok(undefined),
  update = ok({ before: LUNCH, after: LUNCH }),
  rekey = ok({ before: LUNCH, after: LUNCH }),
  remove = ok({ kind: "deleted", checkpoint: LUNCH } as CheckpointDeletion),
  usage = ok({}),
  planned = ok([]),
  auditFails = false,
}: Setup = {}) {
  const store = {
    list: vi.fn(async () => list),
    create: vi.fn(async () => create),
    update: vi.fn(async () => update),
    rekey: vi.fn(async () => rekey),
    delete: vi.fn(async () => remove),
    usage: vi.fn(async () => usage),
  } as unknown as CheckpointStore & Record<"list" | "create" | "update" | "rekey" | "delete" | "usage", ReturnType<typeof vi.fn>>;
  const audit: ManageAudit = { append: vi.fn(async () => (auditFails ? err({ code: "unknown" }) : ok(undefined))) };
  const images: RecordImages = {
    ref: vi.fn((path: string, purpose: string) => (purpose === "checkpoint" && path.includes("/checkpoint/") ? { path, url: `/media/${path}` } : null)),
    remove: vi.fn(async () => undefined),
  };
  const planStands = { ids: vi.fn(async () => planned) };
  const deps: ManageDeps = { store, audit, images, planStands, now: () => NOW };
  return { deps, store, audit, images, planStands };
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("suggestId", () => {
  it.each([
    ["Almuerzo día 1", "almuerzo-dia-1"],
    ["  Coffee   Break  ", "coffee-break"],
    ["Keynote: ¡Bienvenidos!", "keynote-bienvenidos"],
    ["Niño & Niña", "nino-nina"],
    ["---", ""],
    ["", ""],
  ])("turns %j into %j", (name, id) => {
    expect(suggestId(name)).toBe(id);
  });

  it("never goes past the longest id allowed, and does not end on a hyphen", () => {
    const id = suggestId(`${"a".repeat(47)} b`);

    expect(id.length).toBeLessThanOrEqual(48);
    expect(id.endsWith("-")).toBe(false);
  });
});

describe("normalizeName", () => {
  it("trims and collapses spaces", () => {
    expect(normalizeName("  Almuerzo   día 1 ")).toBe("Almuerzo día 1");
  });

  it.each(["", " ", "a", "x".repeat(61)])("rejects %j", (name) => {
    expect(normalizeName(name)).toBeNull();
  });

  it("accepts the limits", () => {
    expect(normalizeName("ab")).toBe("ab");
    expect(normalizeName("x".repeat(60))).toHaveLength(60);
  });
});

describe("createCheckpoint", () => {
  it("creates an open checkpoint and leaves a line in the audit trail", async () => {
    const t = setup();

    const result = await createCheckpoint(t.deps, ADMIN, { name: "  Almuerzo ", id: "lunch-1", kind: "catering" });

    expect(result).toEqual(ok(LUNCH));
    expect(t.store.create).toHaveBeenCalledWith(LUNCH);
    expect(t.audit.append).toHaveBeenCalledWith({
      action: "checkpoint.created",
      actorUid: "a1",
      targetUid: "lunch-1",
      details: { kind: "catering", name: "Almuerzo" },
      at: NOW,
    });
  });

  it.each([
    [{ uid: "s1", role: "staff" }],
    [{ uid: "u1", role: "attendee" }],
    [{ uid: "u2", role: null }],
  ] as const)("is for admins only: %j is refused before anything is written", async (actor) => {
    const t = setup();

    expect(await createCheckpoint(t.deps, actor, { name: "Almuerzo", id: "lunch-1", kind: "catering" })).toEqual(
      err(manageError("forbidden")),
    );
    expect(t.store.create).not.toHaveBeenCalled();
    expect(t.audit.append).not.toHaveBeenCalled();
  });

  it("refuses a bad name, id or kind, in that order, without writing", async () => {
    const t = setup();

    expect(await createCheckpoint(t.deps, ADMIN, { name: "x", id: "lunch-1", kind: "catering" })).toEqual(err(manageError("invalid-name")));
    for (const id of ["", "Lunch 1", "../users", "a", "-x", "x".repeat(49)]) {
      expect(await createCheckpoint(t.deps, ADMIN, { name: "Almuerzo", id, kind: "catering" })).toEqual(err(manageError("invalid-id")));
    }
    expect(await createCheckpoint(t.deps, ADMIN, { name: "Almuerzo", id: "lunch-1", kind: "sponsor" })).toEqual(err(manageError("invalid-kind")));
    // A talk is created in Charlas, with its speaker and schedule.
    expect(await createCheckpoint(t.deps, ADMIN, { name: "Keynote", id: "talk-keynote", kind: "talk" })).toEqual(err(manageError("invalid-kind")));
    expect(t.store.create).not.toHaveBeenCalled();
  });

  it.each(["entrance", "catering", "stand"])("creates a %s station", async (kind) => {
    const t = setup();

    expect(await createCheckpoint(t.deps, ADMIN, { name: "Puesto", id: "puesto-1", kind })).toMatchObject({ ok: true, value: { kind } });
  });

  it("says so when the id is taken, and writes no audit line", async () => {
    const t = setup({ create: err({ code: "already-exists" }) });

    expect(await createCheckpoint(t.deps, ADMIN, { name: "Almuerzo", id: "lunch-1", kind: "catering" })).toEqual(
      err(manageError("already-exists")),
    );
    expect(t.audit.append).not.toHaveBeenCalled();
  });

  it("reports a store failure as unknown", async () => {
    const t = setup({ create: err({ code: "unknown" }) });

    expect(await createCheckpoint(t.deps, ADMIN, { name: "Almuerzo", id: "lunch-1", kind: "catering" })).toEqual(err(manageError("unknown")));
  });

  it("keeps a checkpoint that was created when only the audit write fails, and says so in the log", async () => {
    const t = setup({ auditFails: true });

    expect(await createCheckpoint(t.deps, ADMIN, { name: "Almuerzo", id: "lunch-1", kind: "catering" })).toMatchObject({ ok: true });
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining("checkpoints.audit.append"));
  });
});

describe("setCheckpointActive", () => {
  it("closes an open checkpoint and audits it as deactivated", async () => {
    const t = setup({ update: ok({ before: LUNCH, after: { ...LUNCH, active: false } }) });

    const result = await setCheckpointActive(t.deps, ADMIN, { id: "lunch-1", active: false });

    expect(result).toMatchObject({ ok: true, value: { active: false } });
    expect(t.store.update).toHaveBeenCalledWith("lunch-1", { active: false });
    expect(t.audit.append).toHaveBeenCalledWith(expect.objectContaining({ action: "checkpoint.deactivated", targetUid: "lunch-1" }));
  });

  it("opens a closed one and audits it as activated", async () => {
    const closed = { ...LUNCH, active: false };
    const t = setup({ update: ok({ before: closed, after: LUNCH }) });

    await setCheckpointActive(t.deps, ADMIN, { id: "lunch-1", active: true });

    expect(t.audit.append).toHaveBeenCalledWith(expect.objectContaining({ action: "checkpoint.activated" }));
  });

  it("writes no audit line when it was already in that state", async () => {
    const t = setup({ update: ok({ before: LUNCH, after: LUNCH }) });

    await setCheckpointActive(t.deps, ADMIN, { id: "lunch-1", active: true });

    expect(t.audit.append).not.toHaveBeenCalled();
  });

  it("refuses non-admins and unknown ids, and says so when the checkpoint is missing", async () => {
    const t = setup();

    expect(await setCheckpointActive(t.deps, { uid: "s1", role: "staff" }, { id: "lunch-1", active: false })).toEqual(err(manageError("forbidden")));
    expect(await setCheckpointActive(t.deps, ADMIN, { id: "../x", active: false })).toEqual(err(manageError("not-found")));
    expect(t.store.update).not.toHaveBeenCalled();
    expect(await setCheckpointActive(setup({ update: ok(null) }).deps, ADMIN, { id: "lunch-1", active: false })).toEqual(err(manageError("not-found")));
  });
});

describe("deleteCheckpoint", () => {
  it("deletes a station nobody used and audits it", async () => {
    const t = setup();

    expect(await deleteCheckpoint(t.deps, ADMIN, { id: "lunch-1" })).toEqual(ok(LUNCH));

    expect(t.store.delete).toHaveBeenCalledWith("lunch-1");
    expect(t.audit.append).toHaveBeenCalledWith({ action: "checkpoint.deleted", actorUid: "a1", targetUid: "lunch-1", details: { kind: "catering", name: "Almuerzo" }, at: NOW });
  });

  it.each([
    ["cadets checked in there", "has-check-ins"],
    ["a mission points at it", "has-missions"],
  ] as const)("refuses when %s, and changes nothing", async (_why, kind) => {
    const t = setup({ remove: ok({ kind }) });

    expect(await deleteCheckpoint(t.deps, ADMIN, { id: "lunch-1" })).toEqual(err(manageError(kind)));
    expect(t.audit.append).not.toHaveBeenCalled();
  });

  it("is not found for an unknown or malformed station, and refuses everyone but admins", async () => {
    expect(await deleteCheckpoint(setup({ remove: ok({ kind: "not-found" }) }).deps, ADMIN, { id: "ghost-1" })).toEqual(err(manageError("not-found")));
    expect(await deleteCheckpoint(setup().deps, ADMIN, { id: "No Valid" })).toEqual(err(manageError("not-found")));
    for (const role of ["staff", "attendee", null] as const) {
      const t = setup();
      expect(await deleteCheckpoint(t.deps, { uid: "x", role }, { id: "lunch-1" })).toEqual(err(manageError("forbidden")));
      expect(t.store.delete).not.toHaveBeenCalled();
    }
  });

  it("reports a failed delete, and keeps the delete when only its audit line fails", async () => {
    expect(await deleteCheckpoint(setup({ remove: err({ code: "x" }) }).deps, ADMIN, { id: "lunch-1" })).toEqual(err(manageError("unknown")));
    expect(await deleteCheckpoint(setup({ auditFails: true }).deps, ADMIN, { id: "lunch-1" })).toEqual(ok(LUNCH));
  });
});

describe("listCheckpoints", () => {
  it("lists every checkpoint, open or closed, to an admin", async () => {
    const closed = { ...LUNCH, id: "lunch-2", active: false };

    expect(await listCheckpoints(setup({ list: ok([LUNCH, closed]) }).deps, ADMIN)).toEqual(ok([LUNCH, closed]));
  });

  it("is for admins only, and reports a failed read as unknown", async () => {
    expect(await listCheckpoints(setup().deps, { uid: "s1", role: "staff" })).toEqual(err(manageError("forbidden")));
    expect(await listCheckpoints(setup({ list: err({ code: "unknown" }) }).deps, ADMIN)).toEqual(err(manageError("unknown")));
  });
});

describe("normalizeDescription", () => {
  it("trims, allows empty and refuses more than 200 characters", () => {
    expect(normalizeDescription("  Impresión 3D  ")).toBe("Impresión 3D");
    expect(normalizeDescription(undefined)).toBe("");
    expect(normalizeDescription("x".repeat(200))).toHaveLength(200);
    expect(normalizeDescription("x".repeat(201))).toBeNull();
  });
});

describe("createCheckpoint with a description and an image", () => {
  it("saves both, the image only when it is an upload for a puesto", async () => {
    const t = setup();

    const result = await createCheckpoint(t.deps, ADMIN, { name: "Louis 3D", id: "louis-3d", kind: "stand", description: " Impresión 3D ", imagePath: LOGO });

    expect(result).toMatchObject({ ok: true, value: { description: "Impresión 3D", image: LOGO_REF } });
    expect(t.store.create).toHaveBeenCalledWith(expect.objectContaining({ description: "Impresión 3D", image: LOGO_REF }));
    expect(await createCheckpoint(t.deps, ADMIN, { name: "Louis 3D", id: "louis-3d", kind: "stand", imagePath: "public/e1/mission/abcdef123456.webp" })).toEqual(err(manageError("invalid-image")));
    expect(await createCheckpoint(t.deps, ADMIN, { name: "Louis 3D", id: "louis-3d", kind: "stand", description: "x".repeat(201) })).toEqual(err(manageError("invalid-description")));
  });
});

describe("editCheckpoint", () => {
  const STAND: ManagedCheckpoint = { id: "louis-3d", kind: "stand", name: "Louis 3D", active: true, description: "", image: null, requirements: NONE };
  const GATED = { minLevel: 2, minTalks: 3, minTicket: null };

  it("always saves the name, description and image, and audits what changed", async () => {
    const after = { ...STAND, name: "Louis 3D Lab", description: "Impresión 3D", image: LOGO_REF };
    const t = setup({ list: ok([STAND]), update: ok({ before: STAND, after }) });

    const result = await editCheckpoint(t.deps, ADMIN, { id: "louis-3d", name: " Louis 3D Lab ", description: "Impresión 3D", imagePath: LOGO });

    expect(result).toEqual(ok(after));
    expect(t.store.update).toHaveBeenCalledWith("louis-3d", { name: "Louis 3D Lab", description: "Impresión 3D", image: LOGO_REF });
    expect(t.store.rekey).not.toHaveBeenCalled();
    // Name, description and image never need the plan or the dependency checks.
    expect(t.planStands.ids).not.toHaveBeenCalled();
    expect(t.audit.append).toHaveBeenCalledWith(
      expect.objectContaining({ action: "checkpoint.updated", targetUid: "louis-3d", details: expect.objectContaining({ changed: "name,description,image", from: "Louis 3D" }) }),
    );
  });

  it("keeps the image when none is sent, and drops the one it replaced", async () => {
    const before = { ...STAND, image: { path: "public/e1/checkpoint/old123456789.webp", url: "/media/old" } };
    const kept = setup({ list: ok([before]), update: ok({ before, after: before }) });
    await editCheckpoint(kept.deps, ADMIN, { id: "louis-3d", name: "Louis 3D", description: "" });
    expect(kept.store.update).toHaveBeenCalledWith("louis-3d", { name: "Louis 3D", description: "" });
    expect(kept.images.remove).not.toHaveBeenCalled();
    expect(kept.audit.append).not.toHaveBeenCalled();

    const replaced = setup({ list: ok([before]), update: ok({ before, after: { ...before, image: LOGO_REF } }) });
    await editCheckpoint(replaced.deps, ADMIN, { id: "louis-3d", name: "Louis 3D", description: "", imagePath: LOGO });
    expect(replaced.images.remove).toHaveBeenCalledWith("public/e1/checkpoint/old123456789.webp");
  });

  it("changes the kind when nothing refers to the puesto", async () => {
    const after = { ...STAND, kind: "entrance" as const };
    const t = setup({ list: ok([STAND]), update: ok({ before: STAND, after }) });

    expect(await editCheckpoint(t.deps, ADMIN, { id: "louis-3d", name: "Louis 3D", description: "", kind: "entrance" })).toEqual(ok(after));
    expect(t.store.update).toHaveBeenCalledWith("louis-3d", expect.objectContaining({ kind: "entrance" }));
    expect(t.audit.append).toHaveBeenCalledWith(expect.objectContaining({ details: expect.objectContaining({ changed: "kind", fromKind: "stand", toKind: "entrance" }) }));
  });

  it("moves the puesto to a new id and audits it as reidentified", async () => {
    const after = { ...STAND, id: "louis-lab" };
    const t = setup({ list: ok([STAND]), rekey: ok({ before: STAND, after }) });

    expect(await editCheckpoint(t.deps, ADMIN, { id: "louis-3d", name: "Louis 3D", description: "", newId: "louis-lab" })).toEqual(ok(after));
    expect(t.store.rekey).toHaveBeenCalledWith("louis-3d", "louis-lab", { name: "Louis 3D", description: "" });
    expect(t.store.update).not.toHaveBeenCalled();
    expect(t.audit.append).toHaveBeenCalledWith(
      expect.objectContaining({ action: "checkpoint.reidentified", targetUid: "louis-lab", details: { from: "louis-3d", to: "louis-lab", name: "Louis 3D" } }),
    );
  });

  it("treats the same kind and id as no change", async () => {
    const t = setup({ list: ok([STAND]), update: ok({ before: STAND, after: STAND }) });

    await editCheckpoint(t.deps, ADMIN, { id: "louis-3d", name: "Louis 3D", description: "", kind: "stand", newId: "louis-3d" });

    expect(t.store.update).toHaveBeenCalledWith("louis-3d", { name: "Louis 3D", description: "" });
    expect(t.planStands.ids).not.toHaveBeenCalled();
  });

  it.each([
    ["has check-ins", "has-check-ins"],
    ["is used by a mission", "has-missions"],
  ] as const)("refuses a new kind or id when the puesto %s (the store checks)", async (_why, code) => {
    const kind = setup({ list: ok([STAND]), update: err({ code }) });
    expect(await editCheckpoint(kind.deps, ADMIN, { id: "louis-3d", name: "Louis 3D", description: "", kind: "entrance" })).toEqual(err(manageError(code)));
    const id = setup({ list: ok([STAND]), rekey: err({ code }) });
    expect(await editCheckpoint(id.deps, ADMIN, { id: "louis-3d", name: "Louis 3D", description: "", newId: "louis-lab" })).toEqual(err(manageError(code)));
    expect(id.audit.append).not.toHaveBeenCalled();
  });

  it("refuses a taken id", async () => {
    const t = setup({ list: ok([STAND]), rekey: err({ code: "already-exists" }) });

    expect(await editCheckpoint(t.deps, ADMIN, { id: "louis-3d", name: "Louis 3D", description: "", newId: "lunch-1" })).toEqual(err(manageError("already-exists")));
  });

  it("keeps the kind and id of a stand of the venue plan, but still saves its texts", async () => {
    const PLAN: ManagedCheckpoint = { ...STAND, id: "stand-cloud", name: "Stand Cloud" };
    const t = setup({ list: ok([PLAN]), planned: ok(["stand-cloud"]), update: ok({ before: PLAN, after: PLAN }) });

    expect(await editCheckpoint(t.deps, ADMIN, { id: "stand-cloud", name: "Stand Cloud", description: "", kind: "entrance" })).toEqual(err(manageError("from-plan")));
    expect(await editCheckpoint(t.deps, ADMIN, { id: "stand-cloud", name: "Stand Cloud", description: "", newId: "stand-nube" })).toEqual(err(manageError("from-plan")));
    expect(t.store.update).not.toHaveBeenCalled();
    expect(t.store.rekey).not.toHaveBeenCalled();
    expect(await editCheckpoint(t.deps, ADMIN, { id: "stand-cloud", name: "Stand Cloud", description: "Nube" })).toMatchObject({ ok: true });
  });

  it("clears the food gate of a puesto that stops being a meal", async () => {
    const gated = { ...LUNCH, requirements: GATED };
    const t = setup({ list: ok([gated]), update: ok({ before: gated, after: { ...LUNCH, kind: "stand" } }) });

    await editCheckpoint(t.deps, ADMIN, { id: "lunch-1", name: "Almuerzo", description: "", kind: "stand" });

    expect(t.store.update).toHaveBeenCalledWith("lunch-1", { name: "Almuerzo", description: "", kind: "stand", requirements: null });
  });

  it("saves a meal's food gate and audits it", async () => {
    const t = setup({ update: ok({ before: LUNCH, after: { ...LUNCH, requirements: GATED } }) });

    await editCheckpoint(t.deps, ADMIN, { id: "lunch-1", name: "Almuerzo", description: "", requirements: { minLevel: 2, minTalks: 3, minTicket: null } });

    expect(t.store.update).toHaveBeenCalledWith("lunch-1", { name: "Almuerzo", description: "", requirements: GATED });
    expect(t.audit.append).toHaveBeenCalledWith(expect.objectContaining({ details: expect.objectContaining({ changed: "requirements", minLevel: "2", minTalks: "3" }) }));
  });

  it("refuses bad input before reading anything", async () => {
    const t = setup({ list: ok([STAND]) });
    const base = { id: "louis-3d", name: "Louis 3D", description: "" };

    expect(await editCheckpoint(t.deps, { uid: "s1", role: "staff" }, base)).toEqual(err(manageError("forbidden")));
    expect(await editCheckpoint(t.deps, ADMIN, { ...base, id: "../x" })).toEqual(err(manageError("not-found")));
    expect(await editCheckpoint(t.deps, ADMIN, { ...base, name: "x" })).toEqual(err(manageError("invalid-name")));
    expect(await editCheckpoint(t.deps, ADMIN, { ...base, description: "x".repeat(201) })).toEqual(err(manageError("invalid-description")));
    expect(await editCheckpoint(t.deps, ADMIN, { ...base, imagePath: "https://evil.example/x.png" })).toEqual(err(manageError("invalid-image")));
    expect(await editCheckpoint(t.deps, ADMIN, { ...base, kind: "talk" })).toEqual(err(manageError("invalid-kind")));
    expect(await editCheckpoint(t.deps, ADMIN, { ...base, newId: "No Valid" })).toEqual(err(manageError("invalid-id")));
    expect(await editCheckpoint(t.deps, ADMIN, { ...base, requirements: { minLevel: 11, minTalks: null, minTicket: null } })).toEqual(err(manageError("invalid-level")));
    expect(t.store.list).not.toHaveBeenCalled();
    // A food gate only for a meal.
    expect(await editCheckpoint(t.deps, ADMIN, { ...base, requirements: { minLevel: 2, minTalks: null, minTicket: null } })).toEqual(err(manageError("not-catering")));
    expect(t.store.update).not.toHaveBeenCalled();
  });

  it("never edits a talk, and reports a missing puesto and failed reads or writes", async () => {
    const TALK: ManagedCheckpoint = { id: "talk-1", kind: "talk", name: "Keynote", active: true, description: "", image: null, requirements: NONE };
    expect(await editCheckpoint(setup({ list: ok([TALK]) }).deps, ADMIN, { id: "talk-1", name: "Otro", description: "" })).toEqual(err(manageError("not-found")));
    expect(await editCheckpoint(setup().deps, ADMIN, { id: "ghost-1", name: "Otro", description: "" })).toEqual(err(manageError("not-found")));
    expect(await editCheckpoint(setup({ list: err({ code: "unknown" }) }).deps, ADMIN, { id: "lunch-1", name: "Otro", description: "" })).toEqual(err(manageError("unknown")));
    expect(await editCheckpoint(setup({ update: err({ code: "unknown" }) }).deps, ADMIN, { id: "lunch-1", name: "Otro", description: "" })).toEqual(err(manageError("unknown")));
    expect(await editCheckpoint(setup({ update: ok(null) }).deps, ADMIN, { id: "lunch-1", name: "Otro", description: "" })).toEqual(err(manageError("not-found")));
    expect(await editCheckpoint(setup({ planned: err({ code: "unknown" }) }).deps, ADMIN, { id: "lunch-1", name: "Otro", description: "", kind: "stand" })).toEqual(err(manageError("unknown")));
  });
});

describe("listIdentityLocks", () => {
  it("says why each puesto's kind and id are locked: the plan first, then check-ins, then missions", async () => {
    const t = setup({
      planned: ok(["stand-cloud"]),
      usage: ok({
        "stand-cloud": { checkIns: true, missions: false },
        "lunch-1": { checkIns: true, missions: true },
        "louis-3d": { checkIns: false, missions: true },
        free: { checkIns: false, missions: false },
      }),
    });

    const result = await listIdentityLocks(t.deps, ADMIN, [
      { id: "stand-cloud", kind: "stand" },
      { id: "lunch-1", kind: "catering" },
      { id: "louis-3d", kind: "stand" },
      { id: "free", kind: "entrance" },
    ]);

    expect(result).toEqual(ok({ "stand-cloud": "from-plan", "lunch-1": "has-check-ins", "louis-3d": "has-missions", free: null }));
  });

  it("is for admins only, and reports failed reads", async () => {
    expect(await listIdentityLocks(setup().deps, { uid: "s1", role: "staff" }, [])).toEqual(err(manageError("forbidden")));
    expect(await listIdentityLocks(setup({ usage: err({ code: "unknown" }) }).deps, ADMIN, [])).toEqual(err(manageError("unknown")));
    expect(await listIdentityLocks(setup({ planned: err({ code: "unknown" }) }).deps, ADMIN, [])).toEqual(err(manageError("unknown")));
  });
});

describe("deleteCheckpoint and its image", () => {
  it("deletes the image of the puesto it deleted", async () => {
    const withLogo = { ...LUNCH, image: LOGO_REF };
    const t = setup({ remove: ok({ kind: "deleted", checkpoint: withLogo }) });

    await deleteCheckpoint(t.deps, ADMIN, { id: "lunch-1" });

    expect(t.images.remove).toHaveBeenCalledWith(LOGO);
  });
});
