import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/app-shell/composition/checkpoint-admin.server", () => ({ checkpointAdminDeps: { marker: "deps" } }));

const guards = { getSession: vi.fn() };
vi.mock("@/app-shell/guards", () => guards);

const server = { createCheckpoint: vi.fn(), renameCheckpoint: vi.fn(), setCheckpointActive: vi.fn(), setFoodRequirements: vi.fn() };
vi.mock("@/features/checkpoints/server", () => server);

const features = vi.hoisted(() => ({ FEATURES: { admin: true, checkins: true } }));
vi.mock("@/shared/config/features", () => features);

const { createCheckpointAction, renameCheckpointAction, setCheckpointActiveAction, setFoodRequirementsAction } = await import("./manage.actions");

const session = (role: "attendee" | "staff" | "admin" | null) => ({ uid: "a1", role, displayName: null, photoUrl: null });
const LUNCH = { id: "lunch-1", kind: "catering", name: "Almuerzo", active: true };

describe.each([
  ["createCheckpointAction", () => createCheckpointAction({ name: "Almuerzo", id: "lunch-1", kind: "catering" }), server.createCheckpoint],
  ["renameCheckpointAction", () => renameCheckpointAction({ id: "lunch-1", name: "Otro" }), server.renameCheckpoint],
  ["setCheckpointActiveAction", () => setCheckpointActiveAction({ id: "lunch-1", active: false }), server.setCheckpointActive],
  ["setFoodRequirementsAction", () => setFoodRequirementsAction({ id: "lunch-1", minLevel: 2, minTalks: null }), server.setFoodRequirements],
] as const)("%s", (_name, call, useCase) => {
  beforeEach(() => {
    vi.resetAllMocks();
    features.FEATURES.admin = true;
    features.FEATURES.checkins = true;
    guards.getSession.mockResolvedValue(session("admin"));
  });

  it.each([["admin"], ["checkins"]] as const)("does nothing when the %s feature is switched off", async (flag) => {
    features.FEATURES[flag] = false;

    expect(await call()).toEqual({ ok: false, code: "disabled" });
    expect(guards.getSession).not.toHaveBeenCalled();
    expect(useCase).not.toHaveBeenCalled();
  });

  it("refuses an anonymous caller", async () => {
    guards.getSession.mockResolvedValue(null);

    expect(await call()).toEqual({ ok: false, code: "unauthenticated" });
    expect(useCase).not.toHaveBeenCalled();
  });

  it.each(["attendee", "staff", null] as const)("refuses a %s session", async (role) => {
    guards.getSession.mockResolvedValue(session(role));

    expect(await call()).toEqual({ ok: false, code: "forbidden" });
    expect(useCase).not.toHaveBeenCalled();
  });

  it("uses the actor of the session and returns the checkpoint as plain data", async () => {
    useCase.mockResolvedValue({ ok: true, value: LUNCH });

    expect(await call()).toEqual({ ok: true, checkpoint: LUNCH });
    expect(useCase.mock.calls[0][0]).toEqual({ marker: "deps" });
    expect(useCase.mock.calls[0][1]).toEqual({ uid: "a1", role: "admin" });
  });

  it("maps a use case failure to its code only", async () => {
    useCase.mockResolvedValue({ ok: false, error: { code: "already-exists" } });

    expect(await call()).toEqual({ ok: false, code: "already-exists" });
  });
});

describe("input validation", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    features.FEATURES.admin = true;
    features.FEATURES.checkins = true;
    guards.getSession.mockResolvedValue(session("admin"));
  });

  it("rejects input that is not text or is absurdly long, before touching the use case", async () => {
    expect(await createCheckpointAction({ name: 5 as unknown as string, id: "x-1", kind: "talk" })).toMatchObject({ ok: false });
    expect(await createCheckpointAction({ name: "a".repeat(201), id: "x-1", kind: "talk" })).toMatchObject({ ok: false });
    expect(await renameCheckpointAction({ id: undefined as unknown as string, name: "Otro" })).toMatchObject({ ok: false });
    expect(await setCheckpointActiveAction({ id: "lunch-1", active: "yes" as unknown as boolean })).toEqual({ ok: false, code: "not-found" });
    expect(server.createCheckpoint).not.toHaveBeenCalled();
    expect(server.renameCheckpoint).not.toHaveBeenCalled();
    expect(await setFoodRequirementsAction({ id: "lunch-1", minLevel: "2" as unknown as number, minTalks: null })).toEqual({ ok: false, code: "invalid-level" });
    expect(server.setCheckpointActive).not.toHaveBeenCalled();
    expect(server.setFoodRequirements).not.toHaveBeenCalled();
  });

  it("hands the meal's requirements to the use case as given", async () => {
    server.setFoodRequirements.mockResolvedValue({ ok: true, value: LUNCH });

    await setFoodRequirementsAction({ id: "lunch-1", minLevel: null, minTalks: 3 });
    expect(server.setFoodRequirements).toHaveBeenCalledWith({ marker: "deps" }, { uid: "a1", role: "admin" }, { id: "lunch-1", minLevel: null, minTalks: 3 });
  });
});
