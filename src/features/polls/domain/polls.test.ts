import { describe, expect, it, vi } from "vitest";
import { err, ok } from "@/shared/lib/result";
import { closePoll, createPoll, deletePoll, listPolls, openPoll, pollResults, updatePoll, type PollAdminDeps, type PollContent } from "./manage";
import { checkPollDraft, comparePolls, percentOf, rewardOf, type Poll, type PollDraft } from "./poll";
import { castVote, getCadetPoll, type VoteDeps } from "./vote";

vi.mock("@/shared/lib/log", () => ({ logServerError: vi.fn() }));

const NOW = new Date("2026-10-24T15:00:00Z");
const ADMIN = { uid: "a1", role: "admin" } as const;
const IMG = "public/e1/poll-option/abcdef123456.webp";
const DRAFT: PollDraft = {
  question: "  ¿Qué   charla te gustó más? ",
  options: [
    { text: " Keynote ", imagePath: null },
    { text: "Firebase", imagePath: IMG },
  ],
  changeable: true,
  reward: { kind: "xp", amount: 20 },
};
const poll = (id: string, extra: Partial<Poll> = {}): Poll => ({
  id,
  question: "¿Qué charla te gustó más?",
  options: [
    { id: "o1", text: "Keynote", image: null },
    { id: "o2", text: "Firebase", image: null },
  ],
  changeable: false,
  reward: { kind: "none" },
  status: "draft",
  createdAt: new Date(0),
  openedAt: null,
  closedAt: null,
  ...extra,
});

describe("poll rules", () => {
  it("tidies a draft and keeps its prize", () => {
    expect(checkPollDraft(DRAFT)).toEqual(ok({ question: "¿Qué charla te gustó más?", options: ["Keynote", "Firebase"], changeable: true, reward: { kind: "xp", amount: 20 } }));
  });

  it.each([
    ["a short question", { ...DRAFT, question: "¿Y?" }, "invalid-question"],
    ["one option", { ...DRAFT, options: [{ text: "Sí", imagePath: null }] }, "invalid-options"],
    ["seven options", { ...DRAFT, options: Array.from({ length: 7 }, (_, i) => ({ text: `O${i}`, imagePath: null })) }, "invalid-options"],
    ["a repeated option", { ...DRAFT, options: [{ text: "Sí", imagePath: null }, { text: " sí ", imagePath: null }] }, "invalid-options"],
    ["an empty option", { ...DRAFT, options: [{ text: "Sí", imagePath: null }, { text: " ", imagePath: IMG }] }, "invalid-options"],
    ["too much XP", { ...DRAFT, reward: { kind: "xp", amount: 501 } }, "invalid-reward"],
    ["no credits", { ...DRAFT, reward: { kind: "credits", amount: 0 } }, "invalid-reward"],
    ["an unknown prize", { ...DRAFT, reward: { kind: "badge", amount: 1 } }, "invalid-reward"],
  ] as const)("refuses %s", (_, draft, code) => {
    expect(checkPollDraft(draft)).toEqual(err(code));
  });

  it("pays credits only while the edition gives them, and counts shares", () => {
    expect(rewardOf({ reward: { kind: "credits", amount: 15 } }, true)).toEqual({ xp: 0, credits: 15 });
    expect(rewardOf({ reward: { kind: "credits", amount: 15 } }, false)).toEqual({ xp: 0, credits: 0 });
    expect(rewardOf({ reward: { kind: "xp", amount: 20 } }, false)).toEqual({ xp: 20, credits: 0 });
    expect(percentOf({ counts: { o1: 1, o2: 2 }, total: 3 }, "o2")).toBe(67);
    expect(percentOf({ counts: {}, total: 0 }, "o1")).toBe(0);
  });

  it("lists the open poll first, then drafts and closed ones, newest first", () => {
    const sorted = [poll("closed-1", { status: "closed" }), poll("draft-old"), poll("open-1", { status: "open" }), poll("draft-new", { createdAt: NOW })].sort(comparePolls);
    expect(sorted.map((entry) => entry.id)).toEqual(["open-1", "draft-new", "draft-old", "closed-1"]);
  });
});

function adminSetup(initial: Poll[] = []) {
  const rows = new Map(initial.map((entry) => [entry.id, entry]));
  const deps = {
    store: {
      list: vi.fn(async () => ok([...rows.values()])),
      create: vi.fn(async (next: Poll) => {
        rows.set(next.id, next);
        return ok(undefined);
      }),
      updateDraft: vi.fn(async (id: string, content: PollContent) => {
        const before = rows.get(id);
        if (!before) return ok(null);
        if (before.status !== "draft") return ok("wrong-status" as const);
        const after = { ...before, ...content };
        rows.set(id, after);
        return ok({ before, after });
      }),
      open: vi.fn(async (id: string, at: Date) => {
        const found = rows.get(id);
        if (!found) return ok(null);
        if (found.status !== "draft") return ok("wrong-status" as const);
        if ([...rows.values()].some((entry) => entry.status === "open")) return ok("another-open" as const);
        const next = { ...found, status: "open" as const, openedAt: at };
        rows.set(id, next);
        return ok(next);
      }),
      close: vi.fn(async (id: string, at: Date) => {
        const found = rows.get(id);
        if (!found) return ok(null);
        if (found.status !== "open") return ok("wrong-status" as const);
        const next = { ...found, status: "closed" as const, closedAt: at };
        rows.set(id, next);
        return ok(next);
      }),
      removeDraft: vi.fn(async (id: string) => {
        const found = rows.get(id);
        if (!found) return ok(null);
        if (found.status !== "draft") return ok("wrong-status" as const);
        rows.delete(id);
        return ok(found);
      }),
      tally: vi.fn(async () => ok({ counts: { o1: 2, o2: 1 }, total: 3 })),
    },
    images: {
      ref: vi.fn((path: string, purpose: string) => (purpose === "poll-option" && path.includes("/poll-option/") ? { path, url: `/media/${path}` } : null)),
      remove: vi.fn(async () => undefined),
    },
    audit: { append: vi.fn(async () => ok(undefined)) },
    newId: () => "poll-abc123",
    now: () => NOW,
  } satisfies PollAdminDeps;
  return { deps, rows };
}

describe("poll administration", () => {
  it("is for admins only", async () => {
    const { deps } = adminSetup([poll("poll-1")]);
    const staff = { uid: "s1", role: "staff" } as const;

    expect(await listPolls(deps, staff)).toEqual(err({ code: "forbidden" }));
    expect(await createPoll(deps, staff, { draft: DRAFT })).toEqual(err({ code: "forbidden" }));
    expect(await openPoll(deps, staff, { id: "poll-1" })).toEqual(err({ code: "forbidden" }));
  });

  it("creates a draft with stable option ids and pictures made for poll options, audited", async () => {
    const { deps } = adminSetup();

    const created = await createPoll(deps, ADMIN, { draft: DRAFT });

    expect(created).toMatchObject({
      ok: true,
      value: { id: "poll-abc123", status: "draft", createdAt: NOW, options: [{ id: "o1", text: "Keynote", image: null }, { id: "o2", text: "Firebase", image: { path: IMG } }] },
    });
    expect(deps.audit.append).toHaveBeenCalledWith(expect.objectContaining({ action: "poll.created", targetUid: "poll-abc123" }));
    expect(await createPoll(deps, ADMIN, { draft: { ...DRAFT, options: [DRAFT.options[0], { text: "Otra", imagePath: "public/e1/badge/abcdef123456.webp" }] } })).toEqual(err({ code: "invalid-image" }));
  });

  it("edits only a draft, deleting the pictures it stopped using", async () => {
    const withImage = poll("poll-1", { options: [{ id: "o1", text: "A", image: { path: IMG, url: "u" } }, { id: "o2", text: "B", image: null }] });
    const { deps } = adminSetup([withImage, poll("poll-2", { status: "open" })]);

    expect(await updatePoll(deps, ADMIN, { id: "poll-1", draft: { ...DRAFT, options: [{ text: "A", imagePath: null }, { text: "B", imagePath: null }] } })).toMatchObject({ ok: true });
    expect(deps.images.remove).toHaveBeenCalledWith(IMG);
    expect(await updatePoll(deps, ADMIN, { id: "poll-2", draft: DRAFT })).toEqual(err({ code: "wrong-status" }));
    expect(await updatePoll(deps, ADMIN, { id: "ghost-poll", draft: DRAFT })).toEqual(err({ code: "not-found" }));
  });

  it("opens one poll at a time, closes it for good, and deletes only drafts", async () => {
    const { deps, rows } = adminSetup([poll("poll-1"), poll("poll-2")]);

    expect(await openPoll(deps, ADMIN, { id: "poll-1" })).toMatchObject({ ok: true, value: { status: "open", openedAt: NOW } });
    expect(await openPoll(deps, ADMIN, { id: "poll-2" })).toEqual(err({ code: "another-open" }));
    expect(await deletePoll(deps, ADMIN, { id: "poll-1" })).toEqual(err({ code: "wrong-status" }));
    expect(await closePoll(deps, ADMIN, { id: "poll-1" })).toMatchObject({ ok: true, value: { status: "closed" } });
    expect(await closePoll(deps, ADMIN, { id: "poll-1" })).toEqual(err({ code: "wrong-status" }));
    expect(await openPoll(deps, ADMIN, { id: "poll-1" })).toEqual(err({ code: "wrong-status" }));

    expect(await deletePoll(deps, ADMIN, { id: "poll-2" })).toEqual(ok(undefined));
    expect(rows.has("poll-2")).toBe(false);
    expect(deps.audit.append).toHaveBeenCalledWith(expect.objectContaining({ action: "poll.deleted", targetUid: "poll-2" }));
  });

  it("answers a poll's results, or not found", async () => {
    const { deps } = adminSetup([poll("poll-1", { status: "open" })]);

    expect(await pollResults(deps, ADMIN, { id: "poll-1" })).toMatchObject({ ok: true, value: { poll: { id: "poll-1" }, tally: { total: 3 } } });
    expect(await pollResults(deps, ADMIN, { id: "ghost-poll" })).toEqual(err({ code: "not-found" }));
  });
});

function voteSetup(open: Poll | null, cast: unknown = ok({ first: true, poll: open })) {
  const deps = {
    votes: {
      openPoll: vi.fn(async () => ok(open)),
      myVote: vi.fn(async () => ok(null as string | null)),
      cast: vi.fn(async () => cast as never),
    },
    ledger: { grant: vi.fn(async () => ok({ granted: true })) },
    creditsOn: vi.fn(async () => true),
    limiter: { consume: vi.fn(async () => true) },
    now: () => NOW,
  } satisfies VoteDeps;
  return deps;
}

describe("voting", () => {
  const OPEN = poll("poll-1", { status: "open", reward: { kind: "xp", amount: 20 } });

  it("shows a cadet the open poll with their vote and what voting pays", async () => {
    const deps = voteSetup(OPEN);
    deps.votes.myVote.mockResolvedValue(ok("o2"));

    expect(await getCadetPoll(deps, "u1")).toEqual(ok({ poll: OPEN, myVote: "o2", reward: { xp: 20, credits: 0 } }));
    expect(await getCadetPoll(voteSetup(null), "u1")).toEqual(ok(null));
  });

  it("pays the prize through the ledger once per poll, from the poll the vote's transaction read", async () => {
    const deps = voteSetup(null, ok({ first: true, poll: OPEN }));

    expect(await castVote(deps, "u1", { pollId: "poll-1", optionId: "o1" })).toEqual(ok({ xp: 20, credits: 0 }));
    expect(deps.votes.cast).toHaveBeenCalledWith("poll-1", "u1", "o1", NOW);
    expect(deps.ledger.grant).toHaveBeenCalledWith({ uid: "u1", source: "poll:poll-1", xp: 20, credits: 0 });

    deps.ledger.grant.mockResolvedValueOnce(ok({ granted: false }));
    expect(await castVote(deps, "u1", { pollId: "poll-1", optionId: "o2" })).toEqual(ok({ xp: 0, credits: 0 }));
  });

  it("pays nothing for a poll without a prize, or credits while they are off", async () => {
    const free = voteSetup(null, ok({ first: true, poll: poll("poll-1", { status: "open" }) }));
    expect(await castVote(free, "u1", { pollId: "poll-1", optionId: "o1" })).toEqual(ok({ xp: 0, credits: 0 }));
    expect(free.ledger.grant).not.toHaveBeenCalled();

    const credits = voteSetup(null, ok({ first: true, poll: poll("poll-1", { status: "open", reward: { kind: "credits", amount: 5 } }) }));
    credits.creditsOn.mockResolvedValue(false);
    expect(await castVote(credits, "u1", { pollId: "poll-1", optionId: "o1" })).toEqual(ok({ xp: 0, credits: 0 }));
  });

  it("passes the store's refusals through, and checks the input and the limiter first", async () => {
    expect(await castVote(voteSetup(null, ok("closed")), "u1", { pollId: "poll-1", optionId: "o1" })).toEqual(err({ code: "closed" }));
    expect(await castVote(voteSetup(null, ok("already-voted")), "u1", { pollId: "poll-1", optionId: "o1" })).toEqual(err({ code: "already-voted" }));
    expect(await castVote(voteSetup(null, ok(null)), "u1", { pollId: "poll-1", optionId: "o1" })).toEqual(err({ code: "not-found" }));

    const deps = voteSetup(OPEN);
    expect(await castVote(deps, "u1", { pollId: "poll-1", optionId: "o9" })).toEqual(err({ code: "invalid-option" }));
    expect(await castVote(deps, "u1", { pollId: "Bad Id", optionId: "o1" })).toEqual(err({ code: "not-found" }));
    deps.limiter.consume.mockResolvedValue(false);
    expect(await castVote(deps, "u1", { pollId: "poll-1", optionId: "o1" })).toEqual(err({ code: "rate-limited" }));
    expect(deps.votes.cast).not.toHaveBeenCalled();
  });

  it("asks for a profile when the ledger has none for the cadet", async () => {
    const deps = voteSetup(null, ok({ first: true, poll: OPEN }));
    deps.ledger.grant.mockResolvedValue(err({ code: "not-registered" }) as never);

    expect(await castVote(deps, "u1", { pollId: "poll-1", optionId: "o1" })).toEqual(err({ code: "not-registered" }));
  });
});
