import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const eventStatus = vi.hoisted(() => ({
  getPublicEventState: vi.fn(async () => ({ id: "devfest-2026", name: "DevFest Tacna 2026", venue: null, endsAt: null, finished: true })),
  isPublicEventFinished: vi.fn(async () => true),
}));
vi.mock("@/app-shell/event-status.server", () => eventStatus);

const guards = vi.hoisted(() => ({
  getSession: vi.fn(async () => ({ uid: "u1", role: "attendee", verifiedEmail: "a@b.com", displayName: "Ana", photoUrl: null })),
  getCadetSession: vi.fn(async () => ({ uid: "u1", role: "attendee", verifiedEmail: "a@b.com", displayName: "Ana", photoUrl: null })),
  teamPlayState: vi.fn(async () => "off"),
}));
vi.mock("@/app-shell/guards", () => guards);

const networkServer = vi.hoisted(() => ({
  connectCadets: vi.fn(),
  issueContactCode: vi.fn(),
  saveContactLinks: vi.fn(async () => ({ ok: true, value: { linkedin: "https://www.linkedin.com/in/ana", github: null, web: null } })),
  verifyContactCode: vi.fn(),
}));
vi.mock("@/features/network/server", () => networkServer);
vi.mock("@/app-shell/composition/network.server", () => ({ networkDeps: { marker: "network" } }));
vi.mock("@/app-shell/composition/missions.server", () => ({ missionDeps: { marker: "missions" } }));
vi.mock("@/app-shell/composition/achievements.server", () => ({ unlockAchievements: vi.fn(async () => []) }));
vi.mock("@/app-shell/composition/checkins.server", () => ({ checkInDeps: { marker: "checkins" } }));
vi.mock("@/app-shell/composition/speakers.server", () => ({ speakerCodeDeps: { marker: "speakers" } }));
vi.mock("@/app-shell/composition/team-code.server", () => ({ teamCodeDeps: { marker: "team" } }));
vi.mock("@/app-shell/composition/economy.server", () => ({ currentEconomy: vi.fn(), rewardLedger: {} }));
vi.mock("@/app-shell/composition/attendee.server", () => ({ attendeeDeps: { marker: "attendee" } }));
vi.mock("@/app-shell/composition/dashboard.server", () => ({ dashboardDeps: { marker: "dashboard" } }));
vi.mock("@/app-shell/composition/minigames.server", () => ({ minigameDeps: { marker: "minigame" } }));
vi.mock("@/app-shell/composition/polls.server", () => ({ pollStore: {}, voteDeps: { marker: "polls" } }));
vi.mock("@/app-shell/composition/squads.server", () => ({ squadDeps: { marker: "squads" } }));
vi.mock("@/app-shell/composition/pass.server", () => ({ passDeps: { marker: "pass" } }));
vi.mock("@/app-shell/composition/tickets.server", () => ({ ticketHolders: {} }));
vi.mock("@/app-shell/speakers/linked-speaker.server", () => ({ linkedSpeaker: vi.fn(async () => null) }));

const { recordCheckInAction } = await import("./checkins/record-check-in.action");
const { submitMissionAnswerAction } = await import("./missions/answer.action");
const { startMinigameAction, finishMinigameAction } = await import("./minigames/play.actions");
const { votePollAction } = await import("./polls/vote.action");
const { assignSquadAction } = await import("./squads/assign-squad.action");
const { issuePassAction } = await import("./pass/issue-pass.action");
const { issueContactCodeAction, connectContactAction, saveContactLinksAction } = await import("./network/network.actions");
const { registerAttendeeAction } = await import("./onboarding/register-attendee.action");

describe("post-event server action guards", () => {
  beforeEach(() => {
    eventStatus.isPublicEventFinished.mockResolvedValue(true);
  });

  it("blocks all live-event mutations once the edition finishes, while keeping contact link editing open", async () => {
    expect(await recordCheckInAction("anything")).toEqual({ ok: false, code: "disabled" });
    expect(await submitMissionAnswerAction({ missionId: "m1", answer: { kind: "keyword", value: "abc" } })).toEqual({ ok: false, code: "disabled" });
    expect(await startMinigameAction({ missionId: "m1" })).toEqual({ ok: false, code: "disabled" });
    expect(await finishMinigameAction({ missionId: "m1", won: true })).toEqual({ ok: false, code: "disabled" });
    expect(await votePollAction({ pollId: "p1", optionId: "a" })).toEqual({ ok: false, code: "disabled" });
    expect(await assignSquadAction()).toEqual({ ok: false, code: "disabled" });
    expect(await issuePassAction()).toEqual({ ok: false, code: "disabled" });
    expect(await issueContactCodeAction()).toEqual({ ok: false, code: "disabled" });
    expect(await connectContactAction("payload")).toEqual({ ok: false, code: "disabled" });
    expect(await registerAttendeeAction({ alias: "Nova_7" })).toEqual({ ok: false, code: "forbidden" });

    // Attendees can still update their own social links in read-only post-event Red.
    expect(await saveContactLinksAction({ linkedin: "ana", github: "", web: "" })).toEqual({
      ok: true,
      links: { linkedin: "https://www.linkedin.com/in/ana", github: null, web: null },
    });
  });
});
