import { describe, expect, it, vi } from "vitest";
import { err, ok } from "@/shared/lib/result";
import {
  TALK_QR_MARGIN_MS,
  checkFeedAccess,
  feedTalks,
  getTalkQr,
  talkQrOpen,
  type FeedTalk,
  type TalkQrDeps,
} from "./show-feed";

const SECRET = "s".repeat(32);
const START = new Date("2026-11-21T15:15:00Z");
const END = new Date("2026-11-21T16:00:00Z");
const TALK: FeedTalk = { id: "talk-genkit", title: "Genkit", startsAt: START, endsAt: END, active: true };

describe("checkFeedAccess", () => {
  it("is switched off without a secret or with one shorter than 32 characters", () => {
    expect(checkFeedAccess(`Bearer ${SECRET}`, undefined)).toBe("disabled");
    expect(checkFeedAccess("Bearer short", "short")).toBe("disabled");
  });

  it("lets in the right bearer token, whatever the scheme's case", () => {
    expect(checkFeedAccess(`Bearer ${SECRET}`, SECRET)).toBe("ok");
    expect(checkFeedAccess(`bearer   ${SECRET}  `, SECRET)).toBe("ok");
  });

  it("refuses a missing header, another scheme or another token", () => {
    expect(checkFeedAccess(null, SECRET)).toBe("unauthorized");
    expect(checkFeedAccess(SECRET, SECRET)).toBe("unauthorized");
    expect(checkFeedAccess(`Basic ${SECRET}`, SECRET)).toBe("unauthorized");
    expect(checkFeedAccess(`Bearer ${"t".repeat(32)}`, SECRET)).toBe("unauthorized");
    expect(checkFeedAccess(`Bearer ${SECRET}x`, SECRET)).toBe("unauthorized");
  });
});

describe("talkQrOpen", () => {
  it("opens from 15 minutes before the start until 15 minutes after the end, edges included", () => {
    expect(talkQrOpen(TALK, new Date(START.getTime() - TALK_QR_MARGIN_MS))).toBe(true);
    expect(talkQrOpen(TALK, new Date(END.getTime() + TALK_QR_MARGIN_MS))).toBe(true);
    expect(talkQrOpen(TALK, new Date(START.getTime() - TALK_QR_MARGIN_MS - 1))).toBe(false);
    expect(talkQrOpen(TALK, new Date(END.getTime() + TALK_QR_MARGIN_MS + 1))).toBe(false);
  });

  it("stays closed for an inactive talk or one without a schedule", () => {
    expect(talkQrOpen({ ...TALK, active: false }, START)).toBe(false);
    expect(talkQrOpen({ ...TALK, startsAt: null }, START)).toBe(false);
    expect(talkQrOpen({ ...TALK, endsAt: null }, START)).toBe(false);
  });
});

describe("feedTalks", () => {
  it("lists the talks by start time, unscheduled last, with whether their code is out now", () => {
    const later = { ...TALK, id: "later", title: "Later", startsAt: new Date(END), endsAt: new Date(END.getTime() + 3_600_000) };
    const loose = { ...TALK, id: "loose", title: "Loose", startsAt: null, endsAt: null };

    expect(feedTalks([loose, later, TALK], START)).toEqual([
      { id: "talk-genkit", name: "Genkit", startsAt: START.getTime(), endsAt: END.getTime(), active: true, qrNow: true },
      { id: "later", name: "Later", startsAt: END.getTime(), endsAt: END.getTime() + 3_600_000, active: true, qrNow: false },
      { id: "loose", name: "Loose", startsAt: null, endsAt: null, active: true, qrNow: false },
    ]);
  });
});

describe("getTalkQr", () => {
  const issued = { checkpointId: "talk-genkit", name: "Genkit", cells: ["101", "010"], issuedAt: 1, expiresAt: 2 };
  const setup = (now = START, talks: readonly FeedTalk[] = [TALK]): TalkQrDeps & { issue: ReturnType<typeof vi.fn> } => ({
    talks: vi.fn(async () => ok(talks)),
    issue: vi.fn(async () => ok(issued)),
    now: () => now,
  });

  it("hands out the code of the talk in progress, without the signed text", async () => {
    const deps = setup();

    expect(await getTalkQr(deps, " talk-genkit ")).toEqual(ok({ talkId: "talk-genkit", name: "Genkit", cells: ["101", "010"], issuedAt: 1, expiresAt: 2 }));
    expect(deps.issue).toHaveBeenCalledWith("talk-genkit");
  });

  it("refuses a missing or too long id before reading anything", async () => {
    const deps = setup();

    expect(await getTalkQr(deps, null)).toEqual(err({ code: "bad-request" }));
    expect(await getTalkQr(deps, "x".repeat(49))).toEqual(err({ code: "bad-request" }));
    expect(deps.talks).not.toHaveBeenCalled();
  });

  it("refuses another checkpoint, an inactive talk and a talk out of its window, never issuing", async () => {
    const deps = setup(new Date(END.getTime() + TALK_QR_MARGIN_MS + 1), [TALK, { ...TALK, id: "off", active: false }]);

    expect(await getTalkQr(deps, "entrance")).toEqual(err({ code: "not-found" }));
    expect(await getTalkQr(deps, "off")).toEqual(err({ code: "inactive" }));
    expect(await getTalkQr(deps, "talk-genkit")).toEqual(err({ code: "not-live" }));
    expect(deps.issue).not.toHaveBeenCalled();
  });

  it("answers unknown when the talks cannot be read or the code cannot be issued", async () => {
    const broken = { ...setup(), talks: vi.fn(async () => err({ code: "unknown" })) };
    expect(await getTalkQr(broken, "talk-genkit")).toEqual(err({ code: "unknown" }));

    const failing = setup();
    failing.issue.mockResolvedValue(err({ code: "unknown" }));
    expect(await getTalkQr(failing, "talk-genkit")).toEqual(err({ code: "unknown" }));
  });
});
