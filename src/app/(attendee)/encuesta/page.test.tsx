import { isValidElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/app-shell/composition/polls.server", () => ({ voteDeps: { marker: "votes" } }));
vi.mock("@/app-shell/polls/vote.action", () => ({ votePollAction: vi.fn() }));
const guards = { requireAttendee: vi.fn() };
vi.mock("@/app-shell/guards", () => guards);
class NotFound extends Error {}
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new NotFound("not-found");
  },
}));
const server = vi.hoisted(() => ({ getCadetPoll: vi.fn() }));
vi.mock("@/features/polls/server", () => server);
const features = vi.hoisted(() => ({ FEATURES: { polls: true } }));
vi.mock("@/shared/config/features", () => features);

const { PollVoteView } = await import("@/features/polls");
const { votePollAction } = await import("@/app-shell/polls/vote.action");
const { default: PollPage } = await import("./page");

function findElement(node: ReactNode, type: unknown): { props: Record<string, unknown> } | null {
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findElement(child, type);
      if (found) return found;
    }
    return null;
  }
  if (!isValidElement(node)) return null;
  const element = node as { type: unknown; props: Record<string, unknown> };
  if (element.type === type) return element;
  return findElement(element.props.children as ReactNode, type);
}

describe("cadet poll page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    features.FEATURES.polls = true;
    guards.requireAttendee.mockResolvedValue({ uid: "u1", role: "attendee" });
  });

  it("hands the open poll with the cadet's vote, or none, to the voting screen", async () => {
    const current = { poll: { id: "poll-1" }, myVote: null, reward: { xp: 0, credits: 0 } };
    server.getCadetPoll.mockResolvedValue({ ok: true, value: current });

    const view = findElement(await PollPage(), PollVoteView);
    expect(server.getCadetPoll).toHaveBeenCalledWith({ marker: "votes" }, "u1");
    expect(view?.props).toEqual({ current, vote: votePollAction, homeHref: "/dashboard" });

    server.getCadetPoll.mockResolvedValue({ ok: true, value: null });
    expect(findElement(await PollPage(), PollVoteView)?.props.current).toBeNull();
  });

  it("is not found with polls off, and surfaces a failed read", async () => {
    server.getCadetPoll.mockResolvedValue({ ok: false, error: { code: "unknown" } });
    await expect(PollPage()).rejects.toThrow("Could not read the poll");

    features.FEATURES.polls = false;
    await expect(PollPage()).rejects.toBeInstanceOf(NotFound);
  });
});
