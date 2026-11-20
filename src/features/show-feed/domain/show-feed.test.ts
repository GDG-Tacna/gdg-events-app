import { describe, expect, it, vi } from "vitest";
import { err, ok } from "@/shared/lib/result";
import {
  checkFeedAccess,
  feedTalks,
  getTalkQr,
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

describe("feedTalks", () => {
  it("lists the talks by start time, unscheduled last, with whether their code can be handed out", () => {
    const later = { ...TALK, id: "later", title: "Later", startsAt: new Date(END), endsAt: new Date(END.getTime() + 3_600_000) };
    const loose = { ...TALK, id: "loose", title: "Loose", startsAt: null, endsAt: null, active: false };

    expect(feedTalks([loose, later, TALK])).toEqual([
      { id: "talk-genkit", name: "Genkit", startsAt: START.getTime(), endsAt: END.getTime(), active: true, qrNow: true },
      { id: "later", name: "Later", startsAt: END.getTime(), endsAt: END.getTime() + 3_600_000, active: true, qrNow: true },
      { id: "loose", name: "Loose", startsAt: null, endsAt: null, active: false, qrNow: false },
    ]);
  });
});

describe("getTalkQr", () => {
  const issued = { checkpointId: "talk-genkit", name: "Genkit", cells: ["101", "010"], issuedAt: 1, expiresAt: 2 };
  const setup = (talks: readonly FeedTalk[] = [TALK]): TalkQrDeps & { issue: ReturnType<typeof vi.fn> } => ({
    talks: vi.fn(async () => ok(talks)),
    issue: vi.fn(async () => ok(issued)),
  });

  it("hands out the code of an open talk at any time, scheduled or not, without the signed text", async () => {
    const deps = setup();

    expect(await getTalkQr(deps, " talk-genkit ")).toEqual(ok({ talkId: "talk-genkit", name: "Genkit", cells: ["101", "010"], issuedAt: 1, expiresAt: 2 }));
    expect(deps.issue).toHaveBeenCalledWith("talk-genkit");

    const loose = setup([{ ...TALK, startsAt: null, endsAt: null }]);
    expect((await getTalkQr(loose, "talk-genkit")).ok).toBe(true);
  });

  it("refuses a missing or too long id before reading anything", async () => {
    const deps = setup();

    expect(await getTalkQr(deps, null)).toEqual(err({ code: "bad-request" }));
    expect(await getTalkQr(deps, "x".repeat(49))).toEqual(err({ code: "bad-request" }));
    expect(deps.talks).not.toHaveBeenCalled();
  });

  it("refuses another checkpoint and an inactive talk, never issuing", async () => {
    const deps = setup([TALK, { ...TALK, id: "off", active: false }]);

    expect(await getTalkQr(deps, "entrance")).toEqual(err({ code: "not-found" }));
    expect(await getTalkQr(deps, "off")).toEqual(err({ code: "inactive" }));
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
