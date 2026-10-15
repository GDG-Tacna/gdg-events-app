import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const modules = vi.hoisted(() => ({ clear: vi.fn() }));
const permissionsCache = vi.hoisted(() => ({ clear: vi.fn() }));
vi.mock("@/app-shell/composition/event.server", () => ({ editionsDeps: { marker: "editions" }, copyDeps: { marker: "copy" }, moduleDeps: { marker: "modules" }, editionModules: modules, permissionDeps: { marker: "permissions" }, editionPermissions: permissionsCache }));
const caches = vi.hoisted(() => ({ dropEditionCaches: vi.fn(), forgetCachedKey: vi.fn() }));
vi.mock("@/app-shell/composition/per-edition", () => ({ dropEditionCaches: caches.dropEditionCaches }));
vi.mock("@/shared/lib/ttl-cache", () => ({ forgetCachedKey: caches.forgetCachedKey }));

const guards = { getSession: vi.fn() };
vi.mock("@/app-shell/guards", () => guards);

const server = { createEdition: vi.fn(), updateEdition: vi.fn(), setEditionStatus: vi.fn(), publishEdition: vi.fn(), forgetPublicEdition: vi.fn(), copyEditionContent: vi.fn(), setEditionModules: vi.fn(), setEditionPermissions: vi.fn(), runInEdition: vi.fn() };
vi.mock("@/features/event/server", () => server);

const features = vi.hoisted(() => ({ FEATURES: { admin: true } }));
vi.mock("@/shared/config/features", () => features);

const actions = await import("./editions.actions");

const DRAFT = { name: "Meetup", venue: "", startsAt: "", endsAt: "2026-11-20T21:00" };
const session = (role: string | null, adminScope?: "global" | "edition") => ({ uid: "a1", role, adminScope, displayName: null, photoUrl: null });

describe("editions actions", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    features.FEATURES.admin = true;
    guards.getSession.mockResolvedValue(session("admin", "global"));
    for (const name of ["createEdition", "updateEdition", "setEditionStatus", "publishEdition"] as const) server[name].mockResolvedValue({ ok: true, value: {} });
    server.runInEdition.mockImplementation(async (_eventId: string, work: () => Promise<unknown>) => work());
  });

  const calls = [
    ["create", () => actions.createEditionAction({ id: "meetup-nov", draft: DRAFT })],
    ["update", () => actions.updateEditionAction({ id: "meetup-nov", draft: DRAFT })],
    ["status", () => actions.setEditionStatusAction({ id: "meetup-nov", status: "finished" })],
    ["publish", () => actions.publishEditionAction({ id: "meetup-nov" })],
  ] as const;

  it.each(calls)("%s is off with the admin area off, and only for admins", async (_, call) => {
    features.FEATURES.admin = false;
    expect(await call()).toEqual({ ok: false, code: "disabled" });
    features.FEATURES.admin = true;
    guards.getSession.mockResolvedValue(session("staff"));
    expect(await call()).toEqual({ ok: false, code: "forbidden" });
    guards.getSession.mockResolvedValue(null);
    expect(await call()).toEqual({ ok: false, code: "unauthenticated" });
  });

  it("passes the session's admin scope to every use case, an organizer's as edition", async () => {
    await actions.createEditionAction({ id: "meetup-nov", draft: DRAFT });
    expect(server.createEdition).toHaveBeenCalledWith({ marker: "editions" }, { uid: "a1", role: "admin", adminScope: "global" }, { id: "meetup-nov", draft: DRAFT });

    guards.getSession.mockResolvedValue(session("admin"));
    await actions.updateEditionAction({ id: "meetup-nov", draft: DRAFT });
    expect(server.updateEdition).toHaveBeenCalledWith({ marker: "editions" }, { uid: "a1", role: "admin", adminScope: "edition" }, { id: "meetup-nov", draft: DRAFT });
  });

  it("forgets this server's cached public edition only after a successful publish", async () => {
    expect(await actions.publishEditionAction({ id: "meetup-nov" })).toEqual({ ok: true });
    expect(server.forgetPublicEdition).toHaveBeenCalledTimes(1);

    server.publishEdition.mockResolvedValue({ ok: false, error: { code: "already-public" } });
    expect(await actions.publishEditionAction({ id: "meetup-nov" })).toEqual({ ok: false, code: "already-public" });
    expect(server.forgetPublicEdition).toHaveBeenCalledTimes(1);
  });

  it("rejects malformed input before calling the use cases", async () => {
    expect(await actions.createEditionAction({ id: "x", draft: { ...DRAFT, name: 7 } } as never)).toEqual({ ok: false, code: "invalid-name" });
    expect(await actions.setEditionStatusAction({ id: "x", status: "live" } as never)).toEqual({ ok: false, code: "not-found" });
    expect(server.createEdition).not.toHaveBeenCalled();
    expect(server.setEditionStatus).not.toHaveBeenCalled();
  });

  it("copies content as the session's admin and drops what this server kept of the destination", async () => {
    server.copyEditionContent.mockResolvedValue({ ok: true, value: { parts: ["squads"], documents: 3 } });

    expect(await actions.copyEditionAction({ from: "devfest-2026", to: "meetup-nov", parts: ["squads"] })).toEqual({ ok: true, parts: ["squads"], documents: 3 });
    expect(server.copyEditionContent).toHaveBeenCalledWith({ marker: "copy" }, { uid: "a1", role: "admin", adminScope: "global" }, { from: "devfest-2026", to: "meetup-nov", parts: ["squads"] });
    expect(caches.dropEditionCaches).toHaveBeenCalledWith("meetup-nov");
    expect(caches.forgetCachedKey).toHaveBeenCalledWith("meetup-nov");
  });

  it("passes a refused copy through with the parts in the way, keeping the caches", async () => {
    server.copyEditionContent.mockResolvedValue({ ok: false, error: { code: "not-empty", parts: ["map"] } });

    expect(await actions.copyEditionAction({ from: "devfest-2026", to: "meetup-nov", parts: ["missions"] })).toEqual({ ok: false, code: "not-empty", parts: ["map"] });
    expect(await actions.copyEditionAction({ from: "x", to: "y", parts: "all" } as never)).toEqual({ ok: false, code: "invalid-parts" });
    guards.getSession.mockResolvedValue(session("staff"));
    expect(await actions.copyEditionAction({ from: "x", to: "y", parts: [] })).toEqual({ ok: false, code: "forbidden" });
    expect(caches.dropEditionCaches).not.toHaveBeenCalled();
  });

  it("saves an edition's modules inside that edition and forgets the switches this server kept", async () => {
    server.setEditionModules.mockResolvedValue({ ok: true, value: {} });

    expect(await actions.setEditionModulesAction({ eventId: "meetup-nov", off: ["raffle"] })).toEqual({ ok: true });
    expect(server.runInEdition).toHaveBeenCalledWith("meetup-nov", expect.any(Function));
    expect(server.setEditionModules).toHaveBeenCalledWith({ marker: "modules" }, { uid: "a1", role: "admin", adminScope: "global" }, { off: ["raffle"], eventId: "meetup-nov" });
    expect(modules.clear).toHaveBeenCalledTimes(1);
  });

  it("refuses a bad edition id and passes a refusal through", async () => {
    expect(await actions.setEditionModulesAction({ eventId: "Not Valid", off: [] })).toEqual({ ok: false, code: "invalid-modules" });
    server.setEditionModules.mockResolvedValue({ ok: false, error: { code: "forbidden" } });
    expect(await actions.setEditionModulesAction({ eventId: "meetup-nov", off: [] })).toEqual({ ok: false, code: "forbidden" });
    expect(modules.clear).not.toHaveBeenCalled();
  });

  it("saves an edition's permissions inside that edition and forgets the ones this server kept", async () => {
    server.setEditionPermissions.mockResolvedValue({ ok: true, value: {} });
    const input = { eventId: "meetup-nov", organizer: { raffle: "none" }, staffStations: ["stand"] };

    expect(await actions.setEditionPermissionsAction(input)).toEqual({ ok: true });
    expect(server.runInEdition).toHaveBeenCalledWith("meetup-nov", expect.any(Function));
    expect(server.setEditionPermissions).toHaveBeenCalledWith({ marker: "permissions" }, { uid: "a1", role: "admin", adminScope: "global" }, input);
    expect(permissionsCache.clear).toHaveBeenCalledTimes(1);

    expect(await actions.setEditionPermissionsAction({ ...input, eventId: "Not Valid" })).toEqual({ ok: false, code: "invalid-permissions" });
  });
});
