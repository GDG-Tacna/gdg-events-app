import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/app-shell/composition/polls.server", () => ({ pollAdminDeps: { marker: "polls" } }));
const guards = { getSession: vi.fn() };
vi.mock("@/app-shell/guards", () => guards);
const server = vi.hoisted(() => ({ pollResults: vi.fn() }));
vi.mock("@/features/polls/server", () => server);
const features = vi.hoisted(() => ({ FEATURES: { polls: true } }));
vi.mock("@/shared/config/features", () => features);

const { stagePollAction } = await import("./stage.action");

const session = (role: "attendee" | "admin") => ({ uid: "a1", role, displayName: null, photoUrl: null });
const POLL = {
  id: "poll-1",
  question: "¿Qué?",
  status: "open",
  options: [
    { id: "o1", text: "A", image: null },
    { id: "o2", text: "B", image: { path: "p", url: "/media/p.webp" } },
  ],
};

describe("stagePollAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    features.FEATURES.polls = true;
    guards.getSession.mockResolvedValue(session("admin"));
    server.pollResults.mockResolvedValue({ ok: true, value: { poll: POLL, tally: { counts: { o1: 2 }, total: 2 } } });
  });

  it("answers the poll as the stage draws it, with its votes", async () => {
    expect(await stagePollAction({ id: "poll-1" })).toEqual({
      ok: true,
      poll: { question: "¿Qué?", status: "open", options: [{ id: "o1", text: "A", imageUrl: null }, { id: "o2", text: "B", imageUrl: "/media/p.webp" }] },
      tally: { counts: { o1: 2 }, total: 2 },
    });
    expect(server.pollResults).toHaveBeenCalledWith({ marker: "polls" }, { uid: "a1", role: "admin" }, { id: "poll-1" });
  });

  it("is for admins with polls on, and passes a refusal through", async () => {
    server.pollResults.mockResolvedValueOnce({ ok: false, error: { code: "not-found" } });
    expect(await stagePollAction({ id: "poll-1" })).toEqual({ ok: false, code: "not-found" });

    guards.getSession.mockResolvedValue(session("attendee"));
    expect(await stagePollAction({ id: "poll-1" })).toEqual({ ok: false, code: "forbidden" });
    guards.getSession.mockResolvedValue(null);
    expect(await stagePollAction({ id: "poll-1" })).toEqual({ ok: false, code: "unauthenticated" });
    features.FEATURES.polls = false;
    expect(await stagePollAction({ id: "poll-1" })).toEqual({ ok: false, code: "disabled" });
  });
});
