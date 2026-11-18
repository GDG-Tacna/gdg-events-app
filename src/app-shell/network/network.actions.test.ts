import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/app-shell/composition/network.server", () => ({ networkDeps: { marker: "network" } }));
vi.mock("@/app-shell/composition/missions.server", () => ({ missionDeps: { marker: "missions" } }));
const missionsServer = { completeBySquads: vi.fn() };
vi.mock("@/features/missions/server", () => missionsServer);
const achievements = { unlockAchievements: vi.fn() };
vi.mock("@/app-shell/composition/achievements.server", () => achievements);
const cache = { revalidatePath: vi.fn() };
vi.mock("next/cache", () => cache);

const guards = { getSession: vi.fn() };
vi.mock("@/app-shell/guards", () => guards);

const server = { issueContactCode: vi.fn(), connectCadets: vi.fn(), saveContactLinks: vi.fn(), verifyContactCode: vi.fn() };
vi.mock("@/features/network/server", () => server);

const features = vi.hoisted(() => ({ FEATURES: { network: true, missions: true } }));
vi.mock("@/shared/config/features", () => features);

const { connectContactAction, issueContactCodeAction, saveContactLinksAction } = await import("./network.actions");

const session = (role: "attendee" | "staff" | "admin" | null) => ({ uid: "u1", role, displayName: null, photoUrl: null });
const ACTOR = { uid: "u1", role: "attendee" };
const LINKS = { linkedin: "", github: "octocat", web: "" };
const CARD = { alias: "Bruno", squad: null, links: { linkedin: null, github: null, web: null } };

describe("network actions", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    features.FEATURES.network = true;
    features.FEATURES.missions = true;
    guards.getSession.mockResolvedValue(session("attendee"));
    achievements.unlockAchievements.mockResolvedValue([]);
    server.verifyContactCode.mockReturnValue({ ok: true, value: "uid-bruno" });
    missionsServer.completeBySquads.mockResolvedValue({ ok: true, value: [] });
  });

  const calls = [
    ["issue", () => issueContactCodeAction()],
    ["connect", () => connectContactAction("devfest:ct:x")],
    ["save links", () => saveContactLinksAction(LINKS)],
  ] as const;

  it.each(calls)("%s does nothing with the network switched off, or without a session", async (_, call) => {
    features.FEATURES.network = false;
    expect(await call()).toEqual({ ok: false, code: "disabled" });
    expect(guards.getSession).not.toHaveBeenCalled();

    features.FEATURES.network = true;
    guards.getSession.mockResolvedValue(null);
    expect(await call()).toEqual({ ok: false, code: "unauthenticated" });
  });

  it("issues the code of the cadet of the session, never the signed text", async () => {
    server.issueContactCode.mockReturnValue({ ok: true, value: { cells: ["1"], issuedAt: 1, expiresAt: 2 } });

    expect(await issueContactCodeAction()).toEqual({ ok: true, code: { cells: ["1"], issuedAt: 1, expiresAt: 2 } });
    expect(server.issueContactCode).toHaveBeenCalledWith({ marker: "network" }, ACTOR);

    server.issueContactCode.mockReturnValue({ ok: false, error: { code: "forbidden" } });
    expect(await issueContactCodeAction()).toEqual({ ok: false, code: "forbidden" });
  });

  it("connects with the cadet of the session, unlocks badges and refreshes the Red", async () => {
    const outcome = { card: CARD, created: true, xpEarned: 20, creditsEarned: 5, capReached: false };
    server.connectCadets.mockResolvedValue({ ok: true, value: outcome });
    achievements.unlockAchievements.mockResolvedValue([{ id: "red-estelar", name: "Red estelar", tone: "violet" }]);

    expect(await connectContactAction("devfest:ct:x")).toEqual({ ok: true, ...outcome, missions: [], achievements: [{ id: "red-estelar", name: "Red estelar", tone: "violet" }] });
    expect(server.connectCadets).toHaveBeenCalledWith({ marker: "network" }, ACTOR, "devfest:ct:x");
    expect(achievements.unlockAchievements).toHaveBeenCalledWith("u1");
    expect(cache.revalidatePath).toHaveBeenCalledWith("/red");
  });

  it("completes the squads mission for the cadet who scanned, answering it, and for the cadet who was scanned", async () => {
    server.connectCadets.mockResolvedValue({ ok: true, value: { card: CARD, created: true, xpEarned: 20, creditsEarned: 5, capReached: false } });
    const mine = [{ id: "meet-squads", title: "Conoce a cada escuadrón", xpEarned: 60, creditsEarned: 20, justCompleted: true, extra: "dropped" }];
    missionsServer.completeBySquads.mockImplementation(async (_deps: unknown, uid: string) => ({ ok: true, value: uid === "u1" ? mine : [] }));

    const result = await connectContactAction("devfest:ct:x");

    expect(result).toMatchObject({ ok: true, missions: [{ id: "meet-squads", title: "Conoce a cada escuadrón", xpEarned: 60, creditsEarned: 20, justCompleted: true }] });
    expect(result.ok && result.missions?.[0]).not.toHaveProperty("extra");
    expect(missionsServer.completeBySquads).toHaveBeenCalledWith({ marker: "missions" }, "uid-bruno");
    expect(missionsServer.completeBySquads).toHaveBeenCalledWith({ marker: "missions" }, "u1");
    // The scanned cadet's uid comes from the code that connectCadets just verified, never from the client.
    expect(server.verifyContactCode).toHaveBeenCalledWith({ marker: "network" }, "devfest:ct:x");
  });

  it("still connects, with no missions, when the squads missions fail or the code cannot be read again", async () => {
    server.connectCadets.mockResolvedValue({ ok: true, value: { card: CARD, created: true, xpEarned: 20, creditsEarned: 5, capReached: false } });
    missionsServer.completeBySquads.mockResolvedValue({ ok: false, error: { code: "unknown" } });
    expect(await connectContactAction("devfest:ct:x")).toMatchObject({ ok: true, created: true, missions: [] });

    server.verifyContactCode.mockReturnValue({ ok: false, error: { code: "expired-code" } });
    missionsServer.completeBySquads.mockClear();
    expect(await connectContactAction("devfest:ct:x")).toMatchObject({ ok: true, missions: [] });
    // Only the scanning cadet's mission is looked at: the other cadet's uid is not known.
    expect(missionsServer.completeBySquads).toHaveBeenCalledTimes(1);
    expect(missionsServer.completeBySquads).toHaveBeenCalledWith({ marker: "missions" }, "u1");
  });

  it("leaves the squads missions alone when missions are switched off, and after a refused contact", async () => {
    server.connectCadets.mockResolvedValue({ ok: true, value: { card: CARD, created: true, xpEarned: 20, creditsEarned: 5, capReached: false } });
    features.FEATURES.missions = false;
    expect(await connectContactAction("devfest:ct:x")).toMatchObject({ ok: true, missions: [] });

    features.FEATURES.missions = true;
    server.connectCadets.mockResolvedValue({ ok: false, error: { code: "self" } });
    await connectContactAction("devfest:ct:x");
    expect(missionsServer.completeBySquads).not.toHaveBeenCalled();
  });

  it.each([[""], ["x".repeat(513)], [42 as unknown as string]])("refuses a payload that cannot be a code (%#)", async (payload) => {
    expect(await connectContactAction(payload)).toEqual({ ok: false, code: "invalid-code" });
    expect(server.connectCadets).not.toHaveBeenCalled();
  });

  it("passes a refusal through without unlocking or refreshing anything", async () => {
    server.connectCadets.mockResolvedValue({ ok: false, error: { code: "self" } });

    expect(await connectContactAction("devfest:ct:x")).toEqual({ ok: false, code: "self" });
    expect(achievements.unlockAchievements).not.toHaveBeenCalled();
    expect(cache.revalidatePath).not.toHaveBeenCalled();
  });

  it("saves the links of the cadet of the session and refreshes the Red", async () => {
    const saved = { linkedin: null, github: "https://github.com/octocat", web: null };
    server.saveContactLinks.mockResolvedValue({ ok: true, value: saved });

    expect(await saveContactLinksAction(LINKS)).toEqual({ ok: true, links: saved });
    expect(server.saveContactLinks).toHaveBeenCalledWith({ marker: "network" }, ACTOR, LINKS);
    expect(cache.revalidatePath).toHaveBeenCalledWith("/red");
  });

  it("refuses links of the wrong shape, and passes a refusal through", async () => {
    expect(await saveContactLinksAction({ ...LINKS, web: "x".repeat(301) })).toEqual({ ok: false, code: "unknown" });
    expect(await saveContactLinksAction({ github: "x" } as never)).toEqual({ ok: false, code: "unknown" });
    expect(server.saveContactLinks).not.toHaveBeenCalled();

    server.saveContactLinks.mockResolvedValue({ ok: false, error: { code: "invalid-github" } });
    expect(await saveContactLinksAction(LINKS)).toEqual({ ok: false, code: "invalid-github" });
    expect(cache.revalidatePath).not.toHaveBeenCalled();
  });
});
