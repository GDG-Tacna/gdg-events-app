import { beforeEach, describe, expect, it, vi } from "vitest";
import { copy } from "@/shared/copy/es";

vi.mock("server-only", () => ({}));
vi.mock("@/app-shell/composition/ephemeral-qr.server", () => ({ ephemeralQrDeps: { marker: "qr" } }));
vi.mock("@/app-shell/composition/leaderboard.server", () => ({ stageDeps: { marker: "stage" } }));
const cache = { revalidatePath: vi.fn() };
vi.mock("next/cache", () => cache);
const guards = { getSession: vi.fn() };
vi.mock("@/app-shell/guards", () => guards);
const modules = vi.hoisted(() => ({ moduleOn: vi.fn(async () => true) }));
vi.mock("@/app-shell/modules.server", () => modules);
const permissions = vi.hoisted(() => ({ mayEdit: vi.fn<(session: unknown, section: unknown) => Promise<boolean>>(async () => true) }));
vi.mock("@/app-shell/permissions.server", () => permissions);
const qr = vi.hoisted(() => ({ listTalks: vi.fn() }));
vi.mock("@/features/ephemeral-qr/server", () => qr);
const stage = vi.hoisted(() => ({ updateStage: vi.fn() }));
vi.mock("@/features/leaderboard/server", () => stage);
const features = vi.hoisted(() => ({ FEATURES: { admin: true, checkins: true } }));
vi.mock("@/shared/config/features", () => features);

const { projectTalkAction } = await import("./project.action");

const errors = copy.admin.stage.errors;
const session = (role: "attendee" | "staff" | "admin" | null) => ({ uid: "a1", role, displayName: null, photoUrl: null });
const ADMIN = { uid: "a1", role: "admin" };

describe("projectTalkAction", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    features.FEATURES.admin = true;
    features.FEATURES.checkins = true;
    modules.moduleOn.mockResolvedValue(true);
    permissions.mayEdit.mockResolvedValue(true);
    guards.getSession.mockResolvedValue(session("admin"));
    qr.listTalks.mockResolvedValue({ ok: true, value: [{ id: "keynote", name: "Keynote de apertura" }] });
    stage.updateStage.mockResolvedValue({ ok: true, value: {} });
  });

  it("puts the open talk's QR on the stage with the talk's own name, and refreshes the stage controls", async () => {
    expect(await projectTalkAction({ id: "keynote" })).toEqual({ ok: true });

    expect(qr.listTalks).toHaveBeenCalledWith({ marker: "qr" }, ADMIN);
    expect(stage.updateStage).toHaveBeenCalledWith({ marker: "stage" }, ADMIN, { type: "talk-qr", talkId: "keynote", name: "Keynote de apertura" });
    expect(cache.revalidatePath).toHaveBeenCalledWith("/admin/escenario");
  });

  it("does nothing with the admin, the check-ins or the stage switched off", async () => {
    features.FEATURES.checkins = false;
    expect(await projectTalkAction({ id: "keynote" })).toEqual({ ok: false, text: errors.disabled });
    features.FEATURES.checkins = true;
    modules.moduleOn.mockResolvedValue(false);
    expect(await projectTalkAction({ id: "keynote" })).toEqual({ ok: false, text: errors.disabled });
    modules.moduleOn.mockResolvedValue(true);
    features.FEATURES.admin = false;
    expect(await projectTalkAction({ id: "keynote" })).toEqual({ ok: false, text: errors.disabled });
    expect(guards.getSession).not.toHaveBeenCalled();
    expect(stage.updateStage).not.toHaveBeenCalled();
  });

  it("needs a session, an admin, and the right to edit both the talks and the stage", async () => {
    guards.getSession.mockResolvedValue(null);
    expect(await projectTalkAction({ id: "keynote" })).toEqual({ ok: false, text: errors.unauthenticated });

    guards.getSession.mockResolvedValue(session("staff"));
    expect(await projectTalkAction({ id: "keynote" })).toEqual({ ok: false, text: errors.forbidden });

    guards.getSession.mockResolvedValue(session("admin"));
    permissions.mayEdit.mockImplementation(async (_, section) => section !== "stage");
    expect(await projectTalkAction({ id: "keynote" })).toEqual({ ok: false, text: errors.forbidden });
    permissions.mayEdit.mockImplementation(async (_, section) => section !== "talks");
    expect(await projectTalkAction({ id: "keynote" })).toEqual({ ok: false, text: errors.forbidden });
    expect(stage.updateStage).not.toHaveBeenCalled();
  });

  it("refuses a talk that is not open, or a malformed request", async () => {
    expect(await projectTalkAction({ id: "closed-one" })).toEqual({ ok: false, text: errors["unknown-talk"] });
    expect(await projectTalkAction({ id: 7 } as never)).toEqual({ ok: false, text: errors["unknown-talk"] });
    expect(stage.updateStage).not.toHaveBeenCalled();
    expect(cache.revalidatePath).not.toHaveBeenCalled();
  });

  it("says so when the talks cannot be read or the stage refuses", async () => {
    qr.listTalks.mockResolvedValueOnce({ ok: false, error: { code: "unknown" } });
    expect(await projectTalkAction({ id: "keynote" })).toEqual({ ok: false, text: errors.unknown });

    stage.updateStage.mockResolvedValueOnce({ ok: false, error: { code: "forbidden" } });
    expect(await projectTalkAction({ id: "keynote" })).toEqual({ ok: false, text: errors.forbidden });
    expect(cache.revalidatePath).not.toHaveBeenCalled();
  });
});
