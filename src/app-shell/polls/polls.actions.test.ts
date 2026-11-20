import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
const composition = vi.hoisted(() => ({
  pollAdminDeps: { marker: "polls" },
  voteDeps: { marker: "votes" },
  keptOpenPoll: { clear: vi.fn() },
  keptOpenTally: { clear: vi.fn() },
  pollStore: { tally: vi.fn() },
}));
vi.mock("@/app-shell/composition/polls.server", () => composition);

const guards = { getSession: vi.fn(), getCadetSession: vi.fn() };
vi.mock("@/app-shell/guards", () => guards);

const server = vi.hoisted(() => ({
  createPoll: vi.fn(),
  updatePoll: vi.fn(),
  openPoll: vi.fn(),
  closePoll: vi.fn(),
  deletePoll: vi.fn(),
  pollResults: vi.fn(),
  castVote: vi.fn(),
  getOpenPollTally: vi.fn(),
}));
vi.mock("@/features/polls/server", () => server);

const features = vi.hoisted(() => ({ FEATURES: { admin: true, polls: true } }));
vi.mock("@/shared/config/features", () => features);

const { changePollAction, pollResultsAction, savePollAction } = await import("./manage.actions");
const { votePollAction } = await import("./vote.action");
const { pollTallyAction } = await import("./cadet-tally.action");

const session = (role: "attendee" | "staff" | "admin" | null) => ({ uid: "u1", role, displayName: null, photoUrl: null });
const ADMIN = { uid: "u1", role: "admin" };
const DRAFT = { question: "¿Qué charla te gustó más?", options: [{ text: "A", imagePath: null }, { text: "B", imagePath: null }], changeable: false, reward: { kind: "none", amount: 0 } };

describe("poll admin actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    features.FEATURES.admin = true;
    features.FEATURES.polls = true;
    guards.getSession.mockResolvedValue(session("admin"));
  });

  it("create a draft without an id and edit one with it", async () => {
    server.createPoll.mockResolvedValue({ ok: true, value: {} });
    server.updatePoll.mockResolvedValue({ ok: true, value: {} });

    expect(await savePollAction({ draft: DRAFT })).toEqual({ ok: true });
    expect(server.createPoll).toHaveBeenCalledWith({ marker: "polls" }, ADMIN, { draft: DRAFT });
    expect(await savePollAction({ id: "poll-1", draft: DRAFT })).toEqual({ ok: true });
    expect(server.updatePoll).toHaveBeenCalledWith({ marker: "polls" }, ADMIN, { id: "poll-1", draft: DRAFT });
  });

  it("open, close and delete, forgetting the kept open poll and its tally after each change", async () => {
    server.openPoll.mockResolvedValue({ ok: true, value: {} });
    server.closePoll.mockResolvedValue({ ok: true, value: {} });
    server.deletePoll.mockResolvedValue({ ok: false, error: { code: "wrong-status" } });

    expect(await changePollAction({ id: "poll-1", action: "open" })).toEqual({ ok: true });
    expect(await changePollAction({ id: "poll-1", action: "close" })).toEqual({ ok: true });
    expect(await changePollAction({ id: "poll-1", action: "delete" })).toEqual({ ok: false, code: "wrong-status" });
    expect(composition.keptOpenPoll.clear).toHaveBeenCalledTimes(2);
    expect(composition.keptOpenTally.clear).toHaveBeenCalledTimes(2);
    expect(await changePollAction({ id: "poll-1", action: "explode" } as never)).toEqual({ ok: false, code: "not-found" });
  });

  it("answer the tally for the results screen", async () => {
    server.pollResults.mockResolvedValue({ ok: true, value: { poll: {}, tally: { counts: { o1: 1 }, total: 1 } } });

    expect(await pollResultsAction({ id: "poll-1" })).toEqual({ ok: true, tally: { counts: { o1: 1 }, total: 1 } });
  });

  it("refuse with the module off, without a session, or for anyone but an admin", async () => {
    features.FEATURES.polls = false;
    expect(await savePollAction({ draft: DRAFT })).toEqual({ ok: false, code: "disabled" });
    features.FEATURES.polls = true;

    guards.getSession.mockResolvedValue(null);
    expect(await changePollAction({ id: "poll-1", action: "open" })).toEqual({ ok: false, code: "unauthenticated" });
    guards.getSession.mockResolvedValue(session("attendee"));
    expect(await pollResultsAction({ id: "poll-1" })).toEqual({ ok: false, code: "forbidden" });
    expect(server.createPoll).not.toHaveBeenCalled();
    expect(server.openPoll).not.toHaveBeenCalled();
  });
});

describe("vote action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    features.FEATURES.polls = true;
    guards.getCadetSession.mockResolvedValue(session("attendee"));
  });

  it("votes as the session's cadet and answers what it earned with a fresh count", async () => {
    server.castVote.mockResolvedValue({ ok: true, value: { xp: 20, credits: 0 } });
    composition.pollStore.tally.mockResolvedValue({ ok: true, value: { counts: { o1: 1 }, total: 1 } });

    expect(await votePollAction({ pollId: "poll-1", optionId: "o1" })).toEqual({ ok: true, xp: 20, credits: 0, tally: { counts: { o1: 1 }, total: 1 } });
    expect(server.castVote).toHaveBeenCalledWith({ marker: "votes" }, "u1", { pollId: "poll-1", optionId: "o1" });
    expect(composition.pollStore.tally).toHaveBeenCalledWith("poll-1");
  });

  it("still answers the vote when the count cannot be read", async () => {
    server.castVote.mockResolvedValue({ ok: true, value: { xp: 0, credits: 0 } });
    composition.pollStore.tally.mockResolvedValue({ ok: false, error: { code: "unknown" } });

    expect(await votePollAction({ pollId: "poll-1", optionId: "o1" })).toEqual({ ok: true, xp: 0, credits: 0 });
  });

  it("is for cadets only, with polls on and a sane input", async () => {
    guards.getCadetSession.mockResolvedValue(session("staff"));
    expect(await votePollAction({ pollId: "poll-1", optionId: "o1" })).toEqual({ ok: false, code: "forbidden" });
    guards.getCadetSession.mockResolvedValue(session(null));
    expect(await votePollAction({ pollId: "poll-1", optionId: "o1" })).toEqual({ ok: false, code: "not-registered" });
    guards.getCadetSession.mockResolvedValue(session("attendee"));
    expect(await votePollAction({ pollId: "poll-1", optionId: "too-long" })).toEqual({ ok: false, code: "invalid-option" });
    features.FEATURES.polls = false;
    expect(await votePollAction({ pollId: "poll-1", optionId: "o1" })).toEqual({ ok: false, code: "disabled" });
    expect(server.castVote).not.toHaveBeenCalled();
  });
});

describe("cadet tally action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    features.FEATURES.polls = true;
    guards.getCadetSession.mockResolvedValue(session("attendee"));
  });

  it("answers how the open poll's votes stand, or why not", async () => {
    server.getOpenPollTally.mockResolvedValue({ ok: true, value: { counts: { o1: 2 }, total: 2 } });
    expect(await pollTallyAction({ pollId: "poll-1" })).toEqual({ ok: true, tally: { counts: { o1: 2 }, total: 2 } });
    expect(server.getOpenPollTally).toHaveBeenCalledWith({ marker: "votes" }, "poll-1");

    server.getOpenPollTally.mockResolvedValue({ ok: false, error: { code: "closed" } });
    expect(await pollTallyAction({ pollId: "poll-1" })).toEqual({ ok: false, code: "closed" });
  });

  it("is for cadets only, with polls on and a sane input", async () => {
    guards.getCadetSession.mockResolvedValue(session("staff"));
    expect(await pollTallyAction({ pollId: "poll-1" })).toEqual({ ok: false, code: "forbidden" });
    guards.getCadetSession.mockResolvedValue(session(null));
    expect(await pollTallyAction({ pollId: "poll-1" })).toEqual({ ok: false, code: "not-registered" });
    guards.getCadetSession.mockResolvedValue(null);
    expect(await pollTallyAction({ pollId: "poll-1" })).toEqual({ ok: false, code: "unauthenticated" });
    guards.getCadetSession.mockResolvedValue(session("attendee"));
    expect(await pollTallyAction({ pollId: "" })).toEqual({ ok: false, code: "not-found" });
    features.FEATURES.polls = false;
    expect(await pollTallyAction({ pollId: "poll-1" })).toEqual({ ok: false, code: "disabled" });
    expect(server.getOpenPollTally).not.toHaveBeenCalled();
  });
});
