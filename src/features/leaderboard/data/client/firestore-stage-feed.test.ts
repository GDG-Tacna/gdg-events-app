import { beforeEach, describe, expect, it, vi } from "vitest";

type Listener = { path: string; next: (snapshot: unknown) => void; error: (e: { code: string }) => void; stop: ReturnType<typeof vi.fn> };
const sdk = vi.hoisted(() => ({ listeners: [] as Listener[] }));

vi.mock("firebase/firestore", () => ({
  doc: (_db: unknown, path: string) => ({ path }),
  collection: (_db: unknown, path: string) => ({ path }),
  onSnapshot: (ref: { path: string }, _options: unknown, next: Listener["next"], error: Listener["error"]) => {
    const listener = { path: ref.path, next, error, stop: vi.fn() };
    sdk.listeners.push(listener);
    return listener.stop;
  },
}));

const { FirestoreStageFeed } = await import("./firestore-stage-feed");
const { DEFAULT_STAGE } = await import("../../domain/stage");

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
const handlers = () => ({ stage: vi.fn(), participants: vi.fn(), status: vi.fn() });
const auth = (signedIn = true) => ({ authStateReady: vi.fn(async () => undefined), currentUser: signedIn ? { getIdToken: vi.fn(async () => "fresh") } : null });
const docSnapshot = (data: unknown, fromCache = false) => ({ exists: () => data !== undefined, data: () => data, metadata: { fromCache } });
const querySnapshot = (docs: Array<[string, Record<string, unknown>]>, fromCache = false) => ({ docs: docs.map(([id, data]) => ({ id, data: () => data })), metadata: { fromCache } });

describe("FirestoreStageFeed", () => {
  beforeEach(() => {
    sdk.listeners.length = 0;
  });

  it("listens to the stage document and the edition's participants with the admin's session", async () => {
    const h = handlers();
    new FirestoreStageFeed(() => ({}) as never, () => auth() as never).subscribe("e1", h);
    await flush();

    expect(sdk.listeners.map((l) => l.path)).toEqual(["events/e1/config/stage", "events/e1/participants"]);
    expect(h.status).toHaveBeenLastCalledWith("connecting");

    sdk.listeners[0].next(docSnapshot({ display: "waiting", view: "squads" }));
    sdk.listeners[1].next(querySnapshot([["u1", { alias: "Nova", xp: 10, squad: "firebase" }], ["broken", { xp: 3 }]]));

    expect(h.stage).toHaveBeenLastCalledWith({ display: "waiting", view: "squads", frozen: null, champions: null, raffle: null, background: null, poll: null });
    expect(h.participants).toHaveBeenLastCalledWith([{ uid: "u1", alias: "Nova", squadId: "firebase", xp: 10, reachedAt: null }]);
    expect(h.status).toHaveBeenLastCalledWith("live");
  });

  it("uses the default stage when none is saved or it breaks the rules", async () => {
    const h = handlers();
    new FirestoreStageFeed(() => ({}) as never, () => auth() as never).subscribe("e1", h);
    await flush();

    sdk.listeners[0].next(docSnapshot(undefined));
    expect(h.stage).toHaveBeenLastCalledWith(DEFAULT_STAGE);
    sdk.listeners[0].next(docSnapshot({ display: "fireworks" }));
    expect(h.stage).toHaveBeenLastCalledWith(DEFAULT_STAGE);
  });

  it("says it is reconnecting while either answer comes from the cache", async () => {
    const h = handlers();
    new FirestoreStageFeed(() => ({}) as never, () => auth() as never).subscribe("e1", h);
    await flush();

    sdk.listeners[0].next(docSnapshot(undefined));
    expect(h.status).toHaveBeenLastCalledWith("reconnecting");
    sdk.listeners[1].next(querySnapshot([]));
    expect(h.status).toHaveBeenLastCalledWith("live");
    sdk.listeners[1].next(querySnapshot([], true));
    expect(h.status).toHaveBeenLastCalledWith("reconnecting");
  });

  it("says so when this browser has no session, and listens to nothing", async () => {
    const h = handlers();
    new FirestoreStageFeed(() => ({}) as never, () => auth(false) as never).subscribe("e1", h);
    await flush();

    expect(h.status).toHaveBeenLastCalledWith("signed-out");
    expect(sdk.listeners).toHaveLength(0);
  });

  it("retries once with a fresh token when refused, then says it is denied", async () => {
    const h = handlers();
    const session = auth();
    new FirestoreStageFeed(() => ({}) as never, () => session as never).subscribe("e1", h);
    await flush();

    const first = [...sdk.listeners];
    first[1].error({ code: "permission-denied" });
    await flush();
    expect(session.currentUser?.getIdToken).toHaveBeenCalledWith(true);
    expect(first.every((l) => l.stop.mock.calls.length === 1)).toBe(true);
    expect(sdk.listeners).toHaveLength(4);

    sdk.listeners[3].error({ code: "permission-denied" });
    await flush();
    expect(h.status).toHaveBeenLastCalledWith("denied");
  });

  it("reports other failures as reconnecting", async () => {
    const h = handlers();
    new FirestoreStageFeed(() => ({}) as never, () => auth() as never).subscribe("e1", h);
    await flush();

    sdk.listeners[0].error({ code: "unavailable" });
    await flush();
    expect(h.status).toHaveBeenLastCalledWith("reconnecting");
  });

  it("stops every listener, and starts none when stopped before the session was ready", async () => {
    const stop = new FirestoreStageFeed(() => ({}) as never, () => auth() as never).subscribe("e1", handlers());
    await flush();
    stop();
    expect(sdk.listeners.every((l) => l.stop.mock.calls.length === 1)).toBe(true);

    sdk.listeners.length = 0;
    const early = new FirestoreStageFeed(() => ({}) as never, () => auth() as never).subscribe("e1", handlers());
    early();
    await flush();
    expect(sdk.listeners).toHaveLength(0);
  });
});
