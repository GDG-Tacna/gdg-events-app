import { beforeEach, describe, expect, it, vi } from "vitest";
import { err, ok, type Result } from "@/shared/lib/result";
import {
  createCheckpoint,
  listCheckpoints,
  normalizeName,
  renameCheckpoint,
  setCheckpointActive,
  setFoodRequirements,
  suggestId,
  type CheckpointStore,
  type ManageActor,
  type ManageAudit,
  type ManageDeps,
  type ManagedCheckpoint,
} from "./manage";
import { manageError } from "./manage-error";

const NOW = new Date("2026-10-20T13:00:00Z");
const ADMIN: ManageActor = { uid: "a1", role: "admin" };
const NONE = { minLevel: null, minTalks: null };
const LUNCH: ManagedCheckpoint = { id: "lunch-1", kind: "catering", name: "Almuerzo", active: true, requirements: NONE };

interface Setup {
  list?: Result<readonly ManagedCheckpoint[], { code: string }>;
  create?: Result<void, { code: "already-exists" | "unknown" }>;
  update?: Result<{ before: ManagedCheckpoint; after: ManagedCheckpoint } | null, { code: string }>;
  auditFails?: boolean;
}

function setup({ list = ok([LUNCH]), create = ok(undefined), update = ok({ before: LUNCH, after: LUNCH }), auditFails = false }: Setup = {}) {
  const store: CheckpointStore = {
    list: vi.fn(async () => list),
    create: vi.fn(async () => create),
    update: vi.fn(async () => update),
  };
  const audit: ManageAudit = { append: vi.fn(async () => (auditFails ? err({ code: "unknown" }) : ok(undefined))) };
  const deps: ManageDeps = { store, audit, now: () => NOW };
  return { deps, store, audit };
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

describe("renameCheckpoint", () => {
  const renamed = { before: LUNCH, after: { ...LUNCH, name: "Almuerzo día 1" } };

  it("renames and audits what changed", async () => {
    const t = setup({ update: ok(renamed) });

    const result = await renameCheckpoint(t.deps, ADMIN, { id: "lunch-1", name: " Almuerzo día 1 " });

    expect(result).toEqual(ok(renamed.after));
    expect(t.store.update).toHaveBeenCalledWith("lunch-1", { name: "Almuerzo día 1" });
    expect(t.audit.append).toHaveBeenCalledWith(
      expect.objectContaining({ action: "checkpoint.renamed", targetUid: "lunch-1", details: { from: "Almuerzo", to: "Almuerzo día 1" } }),
    );
  });

  it("writes no audit line when the name did not change", async () => {
    const t = setup({ update: ok({ before: LUNCH, after: LUNCH }) });

    await renameCheckpoint(t.deps, ADMIN, { id: "lunch-1", name: "Almuerzo" });

    expect(t.audit.append).not.toHaveBeenCalled();
  });

  it("refuses non-admins, bad names and ids that cannot exist, without touching the store", async () => {
    const t = setup();

    expect(await renameCheckpoint(t.deps, { uid: "s1", role: "staff" }, { id: "lunch-1", name: "Otro" })).toEqual(err(manageError("forbidden")));
    expect(await renameCheckpoint(t.deps, ADMIN, { id: "lunch-1", name: "x" })).toEqual(err(manageError("invalid-name")));
    expect(await renameCheckpoint(t.deps, ADMIN, { id: "../users", name: "Otro" })).toEqual(err(manageError("not-found")));
    expect(t.store.update).not.toHaveBeenCalled();
  });

  it("says so when the checkpoint does not exist, and reports store failures", async () => {
    expect(await renameCheckpoint(setup({ update: ok(null) }).deps, ADMIN, { id: "lunch-1", name: "Otro" })).toEqual(err(manageError("not-found")));
    expect(await renameCheckpoint(setup({ update: err({ code: "unknown" }) }).deps, ADMIN, { id: "lunch-1", name: "Otro" })).toEqual(
      err(manageError("unknown")),
    );
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

describe("setFoodRequirements", () => {
  const GATED = { minLevel: 2, minTalks: 3 };
  const TALK: ManagedCheckpoint = { id: "talk-1", kind: "talk", name: "Keynote", active: true, requirements: NONE };

  it("saves a meal's minimum level and talks, and audits the change", async () => {
    const t = setup({ update: ok({ before: LUNCH, after: { ...LUNCH, requirements: GATED } }) });

    expect(await setFoodRequirements(t.deps, ADMIN, { id: "lunch-1", minLevel: 2, minTalks: 3 })).toEqual(ok({ ...LUNCH, requirements: GATED }));
    expect(t.store.update).toHaveBeenCalledWith("lunch-1", { requirements: GATED });
    expect(t.audit.append).toHaveBeenCalledWith({
      action: "checkpoint.requirements",
      actorUid: "a1",
      targetUid: "lunch-1",
      details: { name: "Almuerzo", minLevel: "2", minTalks: "3" },
      at: NOW,
    });
  });

  it("clears them: level 1 and 0 talks mean no condition", async () => {
    const t = setup({ update: ok({ before: { ...LUNCH, requirements: GATED }, after: LUNCH }) });

    await setFoodRequirements(t.deps, ADMIN, { id: "lunch-1", minLevel: 1, minTalks: 0 });

    expect(t.store.update).toHaveBeenCalledWith("lunch-1", { requirements: NONE });
    expect(t.audit.append).toHaveBeenCalledWith(expect.objectContaining({ details: { name: "Almuerzo", minLevel: null, minTalks: null } }));
  });

  it("writes no audit line when nothing changed", async () => {
    const same = { ...LUNCH, requirements: GATED };
    const t = setup({ update: ok({ before: same, after: same }) });

    await setFoodRequirements(t.deps, ADMIN, { id: "lunch-1", minLevel: 2, minTalks: 3 });
    expect(t.audit.append).not.toHaveBeenCalled();

    const talksOnly = setup({ update: ok({ before: same, after: { ...LUNCH, requirements: { minLevel: 2, minTalks: null } } }) });
    await setFoodRequirements(talksOnly.deps, ADMIN, { id: "lunch-1", minLevel: 2, minTalks: null });
    expect(talksOnly.audit.append).toHaveBeenCalled();

    const levelOnly = setup({ update: ok({ before: same, after: { ...LUNCH, requirements: { minLevel: 3, minTalks: 3 } } }) });
    await setFoodRequirements(levelOnly.deps, ADMIN, { id: "lunch-1", minLevel: 3, minTalks: 3 });
    expect(levelOnly.audit.append).toHaveBeenCalled();
  });

  it("refuses non-admins, values out of range, unknown ids and checkpoints that are not meals", async () => {
    const t = setup({ list: ok([LUNCH, TALK]) });

    expect(await setFoodRequirements(t.deps, { uid: "s1", role: "staff" }, { id: "lunch-1", minLevel: 2, minTalks: null })).toEqual(err(manageError("forbidden")));
    expect(await setFoodRequirements(t.deps, ADMIN, { id: "lunch-1", minLevel: 11, minTalks: null })).toEqual(err(manageError("invalid-level")));
    expect(await setFoodRequirements(t.deps, ADMIN, { id: "lunch-1", minLevel: null, minTalks: 51 })).toEqual(err(manageError("invalid-talks")));
    expect(await setFoodRequirements(t.deps, ADMIN, { id: "../x", minLevel: 2, minTalks: null })).toEqual(err(manageError("not-found")));
    expect(await setFoodRequirements(t.deps, ADMIN, { id: "lunch-9", minLevel: 2, minTalks: null })).toEqual(err(manageError("not-found")));
    expect(await setFoodRequirements(t.deps, ADMIN, { id: "talk-1", minLevel: 2, minTalks: null })).toEqual(err(manageError("not-catering")));
    expect(t.store.update).not.toHaveBeenCalled();
  });

  it("reports failed reads and writes, and a checkpoint gone meanwhile", async () => {
    expect(await setFoodRequirements(setup({ list: err({ code: "unknown" }) }).deps, ADMIN, { id: "lunch-1", minLevel: 2, minTalks: null })).toEqual(err(manageError("unknown")));
    expect(await setFoodRequirements(setup({ update: err({ code: "unknown" }) }).deps, ADMIN, { id: "lunch-1", minLevel: 2, minTalks: null })).toEqual(err(manageError("unknown")));
    expect(await setFoodRequirements(setup({ update: ok(null) }).deps, ADMIN, { id: "lunch-1", minLevel: 2, minTalks: null })).toEqual(err(manageError("not-found")));
  });
});
