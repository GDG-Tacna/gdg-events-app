import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const source = { invalidate: vi.fn() };
const titleSource = { invalidate: vi.fn() };
vi.mock("@/app-shell/composition/odyssey.server", () => ({
  odysseyAdminDeps: { marker: "admin" },
  storyAdminDeps: { marker: "story" },
  communicationSource: source,
  storyTitleSource: titleSource,
}));

const guards = { getSession: vi.fn() };
vi.mock("@/app-shell/guards", () => guards);

const server = {
  DEFAULT_COMMUNICATIONS: [{ id: "seed-1" }],
  seedCommunications: vi.fn(),
  createCommunication: vi.fn(),
  updateCommunication: vi.fn(),
  setCommunicationActive: vi.fn(),
  moveCommunication: vi.fn(),
  saveStoryTitle: vi.fn(),
};
vi.mock("@/features/odyssey/server", () => server);

const features = vi.hoisted(() => ({ FEATURES: { admin: true, odyssey: true } }));
vi.mock("@/shared/config/features", () => features);

const actions = await import("./manage.actions");

const session = (role: "attendee" | "staff" | "admin" | null) => ({ uid: "a1", role, displayName: null, photoUrl: null });
const ADMIN = { uid: "a1", role: "admin" };
const DRAFT = { quadrantId: "ai", title: "Señal", body: "Texto de la señal", unlockMissionId: null };

describe("odyssey admin actions", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    Object.assign(features.FEATURES, { admin: true, odyssey: true });
    guards.getSession.mockResolvedValue(session("admin"));
    for (const name of ["seedCommunications", "createCommunication", "updateCommunication", "setCommunicationActive", "moveCommunication", "saveStoryTitle"] as const) {
      server[name].mockResolvedValue({ ok: true, value: null });
    }
  });

  const calls = [
    ["seed", () => actions.seedCommunicationsAction()],
    ["create", () => actions.createCommunicationAction({ id: "ai-senal", draft: DRAFT })],
    ["update", () => actions.updateCommunicationAction({ id: "ai-senal", draft: DRAFT })],
    ["activate", () => actions.setCommunicationActiveAction({ id: "ai-senal", active: true })],
    ["move", () => actions.moveCommunicationAction({ id: "ai-senal", to: 0 })],
    ["title", () => actions.saveStoryTitleAction({ title: "Odisea" })],
  ] as const;

  it.each(calls)("%s is off with the flags off, and only for admins", async (_, call) => {
    features.FEATURES.odyssey = false;
    expect(await call()).toEqual({ ok: false, code: "disabled" });
    features.FEATURES.odyssey = true;
    guards.getSession.mockResolvedValue(session("staff"));
    expect(await call()).toEqual({ ok: false, code: "forbidden" });
    guards.getSession.mockResolvedValue(null);
    expect(await call()).toEqual({ ok: false, code: "unauthenticated" });
    expect(source.invalidate).not.toHaveBeenCalled();
    expect(titleSource.invalidate).not.toHaveBeenCalled();
  });

  it("names the story with the session's actor and drops the cached title, never on a refusal", async () => {
    expect(await actions.saveStoryTitleAction({ title: "Odisea de Código" })).toEqual({ ok: true });
    expect(server.saveStoryTitle).toHaveBeenCalledWith({ marker: "story" }, ADMIN, { title: "Odisea de Código" });
    expect(titleSource.invalidate).toHaveBeenCalledTimes(1);

    expect(await actions.saveStoryTitleAction({ title: 7 } as never)).toEqual({ ok: false, code: "invalid-story-title" });
    server.saveStoryTitle.mockResolvedValue({ ok: false, error: { code: "invalid-story-title" } });
    expect(await actions.saveStoryTitleAction({ title: "ab" })).toEqual({ ok: false, code: "invalid-story-title" });
    expect(titleSource.invalidate).toHaveBeenCalledTimes(1);
  });

  it("runs each use case with the actor of the session and drops the attendees' cache", async () => {
    await actions.seedCommunicationsAction();
    await actions.createCommunicationAction({ id: "ai-senal", draft: DRAFT });
    await actions.updateCommunicationAction({ id: "ai-senal", draft: DRAFT });
    await actions.setCommunicationActiveAction({ id: "ai-senal", active: false });
    await actions.moveCommunicationAction({ id: "ai-senal", to: 2 });

    expect(server.seedCommunications).toHaveBeenCalledWith({ marker: "admin" }, ADMIN, server.DEFAULT_COMMUNICATIONS);
    expect(server.createCommunication).toHaveBeenCalledWith({ marker: "admin" }, ADMIN, { id: "ai-senal", draft: DRAFT });
    expect(server.updateCommunication).toHaveBeenCalledWith({ marker: "admin" }, ADMIN, { id: "ai-senal", draft: DRAFT });
    expect(server.setCommunicationActive).toHaveBeenCalledWith({ marker: "admin" }, ADMIN, { id: "ai-senal", active: false });
    expect(server.moveCommunication).toHaveBeenCalledWith({ marker: "admin" }, ADMIN, { id: "ai-senal", to: 2 });
    expect(source.invalidate).toHaveBeenCalledTimes(5);
  });

  it("rejects malformed input and passes refusals through", async () => {
    expect(await actions.createCommunicationAction({ id: "x1", draft: { ...DRAFT, body: 42 } } as never)).toEqual({ ok: false, code: "invalid-title" });
    expect(await actions.setCommunicationActiveAction({ id: "x1", active: "no" } as never)).toEqual({ ok: false, code: "not-found" });
    expect(await actions.moveCommunicationAction({ id: "x1", to: -1 })).toEqual({ ok: false, code: "not-found" });

    server.updateCommunication.mockResolvedValue({ ok: false, error: { code: "unknown-mission" } });
    expect(await actions.updateCommunicationAction({ id: "ai-senal", draft: DRAFT })).toEqual({ ok: false, code: "unknown-mission" });
    expect(source.invalidate).not.toHaveBeenCalled();
  });
});
