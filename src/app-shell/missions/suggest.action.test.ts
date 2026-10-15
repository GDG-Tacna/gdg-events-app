import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/app-shell/composition/mission-suggest.server", () => ({ missionSuggestDeps: { marker: "suggest" } }));

const guards = { getSession: vi.fn() };
vi.mock("@/app-shell/guards", () => guards);

const server = { suggestMissions: vi.fn() };
vi.mock("@/features/missions/server", () => server);

const features = vi.hoisted(() => ({ FEATURES: { admin: true, missions: true, missionSuggestions: true } }));
vi.mock("@/shared/config/features", () => features);

const { suggestMissionsAction } = await import("./suggest.action");

const session = (role: "attendee" | "staff" | "admin" | null) => ({ uid: "a1", role, displayName: null, photoUrl: null });
const INPUT = { topic: "Charla sobre Gemini", quadrantId: "ai", types: ["quiz"], count: 2 };

describe("suggestMissionsAction", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    Object.assign(features.FEATURES, { admin: true, missions: true, missionSuggestions: true });
    guards.getSession.mockResolvedValue(session("admin"));
    server.suggestMissions.mockResolvedValue({ ok: true, value: [{ id: "ai-x", draft: {} }] });
  });

  it.each(["admin", "missions", "missionSuggestions"] as const)("is off when %s is switched off", async (flag) => {
    features.FEATURES[flag] = false;

    expect(await suggestMissionsAction(INPUT)).toEqual({ ok: false, code: "disabled" });
    expect(guards.getSession).not.toHaveBeenCalled();
  });

  it("is only for admins", async () => {
    guards.getSession.mockResolvedValue(null);
    expect(await suggestMissionsAction(INPUT)).toEqual({ ok: false, code: "unauthenticated" });
    guards.getSession.mockResolvedValue(session("staff"));
    expect(await suggestMissionsAction(INPUT)).toEqual({ ok: false, code: "forbidden" });
    expect(server.suggestMissions).not.toHaveBeenCalled();
  });

  it("asks with the actor of the session and returns the drafts", async () => {
    expect(await suggestMissionsAction(INPUT)).toEqual({ ok: true, suggestions: [{ id: "ai-x", draft: {} }] });
    expect(server.suggestMissions).toHaveBeenCalledWith({ marker: "suggest" }, { uid: "a1", role: "admin" }, INPUT);
  });

  it("rejects malformed input and passes refusals through", async () => {
    expect(await suggestMissionsAction({ ...INPUT, count: "3" } as never)).toEqual({ ok: false, code: "invalid-topic" });
    expect(server.suggestMissions).not.toHaveBeenCalled();

    server.suggestMissions.mockResolvedValue({ ok: false, error: { code: "quota" } });
    expect(await suggestMissionsAction(INPUT)).toEqual({ ok: false, code: "quota" });
  });
});
