import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/app-shell/composition/leaderboard.server", () => ({ stageDeps: { marker: "stage" } }));
const cache = { revalidatePath: vi.fn() };
vi.mock("next/cache", () => cache);
const guards = { getSession: vi.fn() };
vi.mock("@/app-shell/guards", () => guards);
const server = { updateStage: vi.fn() };
vi.mock("@/features/leaderboard/server", () => server);
const polls = vi.hoisted(() => ({ pollStore: { list: vi.fn() } }));
vi.mock("@/app-shell/composition/polls.server", () => polls);
const features = vi.hoisted(() => ({ FEATURES: { admin: true, leaderboard: true, polls: true } }));
vi.mock("@/shared/config/features", () => features);

const { updateStageAction } = await import("./stage.actions");

const session = (role: "attendee" | "staff" | "admin" | null) => ({ uid: "a1", role, displayName: null, photoUrl: null });

describe("updateStageAction", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    features.FEATURES.admin = true;
    features.FEATURES.leaderboard = true;
    guards.getSession.mockResolvedValue(session("admin"));
    server.updateStage.mockResolvedValue({ ok: true, value: {} });
  });

  it("is off with the admin or the ranking switched off", async () => {
    features.FEATURES.leaderboard = false;
    expect(await updateStageAction({ type: "freeze" })).toEqual({ ok: false, code: "disabled" });
    features.FEATURES.leaderboard = true;
    features.FEATURES.admin = false;
    expect(await updateStageAction({ type: "freeze" })).toEqual({ ok: false, code: "disabled" });
    expect(guards.getSession).not.toHaveBeenCalled();
  });

  it("hands the use case every field of a command, so a background arrives with its image", async () => {
    const path = "public/e1/stage-background/abcdef123456.webp";

    expect(await updateStageAction({ type: "background", path })).toEqual({ ok: true });
    expect(server.updateStage).toHaveBeenCalledWith({ marker: "stage" }, { uid: "a1", role: "admin" }, { type: "background", path });
    await updateStageAction({ type: "background", path: null });
    expect(server.updateStage).toHaveBeenLastCalledWith({ marker: "stage" }, { uid: "a1", role: "admin" }, { type: "background", path: null });
  });

  it("puts on screen only a poll that exists and was opened, with polls on", async () => {
    polls.pollStore.list.mockResolvedValue({ ok: true, value: [{ id: "poll-open", status: "open" }, { id: "poll-draft", status: "draft" }] });

    expect(await updateStageAction({ type: "poll", pollId: "poll-open" })).toEqual({ ok: true });
    expect(server.updateStage).toHaveBeenCalledWith({ marker: "stage" }, { uid: "a1", role: "admin" }, { type: "poll", pollId: "poll-open" });
    expect(await updateStageAction({ type: "poll", pollId: "poll-draft" })).toEqual({ ok: false, code: "unknown-poll" });
    expect(await updateStageAction({ type: "poll", pollId: "ghost" })).toEqual({ ok: false, code: "unknown-poll" });
    features.FEATURES.polls = false;
    expect(await updateStageAction({ type: "poll", pollId: "poll-open" })).toEqual({ ok: false, code: "unknown-poll" });
    features.FEATURES.polls = true;
    expect(server.updateStage).toHaveBeenCalledTimes(1);
  });

  it("is only for admins", async () => {
    guards.getSession.mockResolvedValue(null);
    expect(await updateStageAction({ type: "freeze" })).toEqual({ ok: false, code: "unauthenticated" });
    guards.getSession.mockResolvedValue(session("staff"));
    expect(await updateStageAction({ type: "freeze" })).toEqual({ ok: false, code: "forbidden" });
    expect(server.updateStage).not.toHaveBeenCalled();
  });

  it("runs the command as the admin of the session and refreshes the screen", async () => {
    expect(await updateStageAction({ type: "view", view: "squads" })).toEqual({ ok: true });
    expect(server.updateStage).toHaveBeenCalledWith({ marker: "stage" }, { uid: "a1", role: "admin" }, { type: "view", view: "squads" });
    expect(cache.revalidatePath).toHaveBeenCalledWith("/admin/escenario");
  });

  it("refuses a malformed command, and passes a refusal through", async () => {
    expect(await updateStageAction({ kind: "freeze" } as never)).toEqual({ ok: false, code: "invalid-command" });
    expect(server.updateStage).not.toHaveBeenCalled();

    server.updateStage.mockResolvedValue({ ok: false, error: { code: "not-frozen" } });
    expect(await updateStageAction({ type: "unfreeze" })).toEqual({ ok: false, code: "not-frozen" });
    expect(cache.revalidatePath).not.toHaveBeenCalled();
  });
});
