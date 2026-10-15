import { describe, expect, it, vi } from "vitest";
import { err, ok } from "@/shared/lib/result";
import { pwaError, type ServiceWorkerHost } from "./ports";
import { initialPwaState, pwaReducer, type PwaEvent, type PwaState } from "./pwa-state";
import { applyUpdate, startPwa } from "./use-cases";

const run = (events: PwaEvent[], from: PwaState = initialPwaState) => events.reduce(pwaReducer, from);

describe("pwaReducer", () => {
  it("starts with no update and no failure", () => {
    expect(initialPwaState).toEqual({ update: "none", updateFailed: false });
  });

  it("goes available, then applying", () => {
    expect(run([{ type: "update-available" }])).toEqual({ update: "available", updateFailed: false });
    expect(run([{ type: "update-available" }, { type: "update-applying" }])).toEqual({
      update: "applying",
      updateFailed: false,
    });
  });

  it("cannot apply an update that is not available", () => {
    expect(run([{ type: "update-applying" }])).toEqual({ update: "none", updateFailed: false });
  });

  it("a failed attempt goes back to available, remembers it failed, and lets the user try again", () => {
    const failed = run([{ type: "update-available" }, { type: "update-applying" }, { type: "update-failed" }]);

    expect(failed).toEqual({ update: "available", updateFailed: true });
    expect(run([{ type: "update-applying" }], failed)).toEqual({ update: "applying", updateFailed: false });
  });

  it("a failure without an attempt in progress changes nothing", () => {
    expect(run([{ type: "update-failed" }])).toEqual({ update: "none", updateFailed: false });
    expect(run([{ type: "update-failed" }], { update: "available", updateFailed: false })).toEqual({
      update: "available",
      updateFailed: false,
    });
  });

  it("another available signal while applying does not reset the progress", () => {
    const applying: PwaState = { update: "applying", updateFailed: false };

    expect(run([{ type: "update-available" }], applying)).toBe(applying);
  });

  it("returns the same state object when nothing changes", () => {
    const available: PwaState = { update: "available", updateFailed: false };

    expect(pwaReducer(available, { type: "update-available" })).toBe(available);
  });
});

function fakeHost(overrides: Partial<ServiceWorkerHost> = {}) {
  let listener: (() => void) | undefined;
  const unsubscribe = vi.fn();
  const host: ServiceWorkerHost = {
    supported: true,
    register: vi.fn(async () => ok(undefined)),
    onUpdateAvailable: vi.fn((fn: () => void) => {
      listener = fn;
      return unsubscribe;
    }),
    applyUpdate: vi.fn(async () => ok(undefined)),
    checkForUpdate: vi.fn(async () => undefined),
    ...overrides,
  };
  return { host, unsubscribe, emitUpdate: () => listener?.() };
}

describe("startPwa", () => {
  it("registers the worker and reports updates", async () => {
    const { host, emitUpdate } = fakeHost();
    const onUpdate = vi.fn();

    const result = await startPwa({ host, enabled: true }, onUpdate);

    expect(result.ok).toBe(true);
    expect(host.register).toHaveBeenCalledOnce();
    emitUpdate();
    expect(onUpdate).toHaveBeenCalledOnce();
  });

  it("listens before registering, so an update that was already waiting is not missed", async () => {
    const order: string[] = [];
    const { host } = fakeHost({
      onUpdateAvailable: vi.fn(() => {
        order.push("listen");
        return () => undefined;
      }),
      register: vi.fn(async () => {
        order.push("register");
        return ok(undefined);
      }),
    });

    await startPwa({ host, enabled: true }, vi.fn());

    expect(order).toEqual(["listen", "register"]);
  });

  it("does nothing when disabled (development) and never touches the browser", async () => {
    const { host } = fakeHost();

    const result = await startPwa({ host, enabled: false }, vi.fn());

    expect(result).toEqual(err(pwaError("unsupported")));
    expect(host.register).not.toHaveBeenCalled();
    expect(host.onUpdateAvailable).not.toHaveBeenCalled();
  });

  it("does nothing in a browser without service workers", async () => {
    const { host } = fakeHost({ supported: false });

    expect(await startPwa({ host, enabled: true }, vi.fn())).toEqual(err(pwaError("unsupported")));
    expect(host.register).not.toHaveBeenCalled();
  });

  it("stops listening when registration fails, and reports why", async () => {
    const { host, unsubscribe } = fakeHost({ register: vi.fn(async () => err(pwaError("registration-failed"))) });

    expect(await startPwa({ host, enabled: true }, vi.fn())).toEqual(err(pwaError("registration-failed")));
    expect(unsubscribe).toHaveBeenCalledOnce();
  });

  it("the session stops listening", async () => {
    const { host, unsubscribe } = fakeHost();
    const result = await startPwa({ host, enabled: true }, vi.fn());

    if (result.ok) result.value.stop();

    expect(unsubscribe).toHaveBeenCalledOnce();
  });
});

describe("applyUpdate", () => {
  it("asks the host to activate the waiting version", async () => {
    const { host } = fakeHost();

    expect(await applyUpdate({ host })).toEqual(ok(undefined));
    expect(host.applyUpdate).toHaveBeenCalledOnce();
  });

  it("passes a failure through", async () => {
    const { host } = fakeHost({ applyUpdate: vi.fn(async () => err(pwaError("update-failed"))) });

    expect(await applyUpdate({ host })).toEqual(err(pwaError("update-failed")));
  });
});
