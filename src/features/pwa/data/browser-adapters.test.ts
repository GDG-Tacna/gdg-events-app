// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BrowserConnectivity } from "./browser-connectivity";
import { BrowserPlatform } from "./browser-platform";
import { BrowserServiceWorkerHost } from "./browser-service-worker-host";

class FakeWorker extends EventTarget {
  state = "installing";
  postMessage = vi.fn();
}

class FakeRegistration extends EventTarget {
  installing: FakeWorker | null = null;
  waiting: FakeWorker | null = null;
  update = vi.fn(async () => undefined);
}

class FakeServiceWorkerContainer extends EventTarget {
  controller: object | null = null;
  registration = new FakeRegistration();
  register = vi.fn<(url: string, options?: object) => Promise<FakeRegistration>>(async () => this.registration);
}

function installServiceWorker(container: FakeServiceWorkerContainer | undefined) {
  if (container) Object.defineProperty(navigator, "serviceWorker", { value: container, configurable: true });
  else Reflect.deleteProperty(navigator, "serviceWorker");
}

describe("BrowserServiceWorkerHost", () => {
  let container: FakeServiceWorkerContainer;

  beforeEach(() => {
    container = new FakeServiceWorkerContainer();
    installServiceWorker(container);
  });
  afterEach(() => installServiceWorker(undefined));

  it("reports whether the browser has service workers", () => {
    expect(new BrowserServiceWorkerHost().supported).toBe(true);

    installServiceWorker(undefined);
    expect(new BrowserServiceWorkerHost().supported).toBe(false);
  });

  it("refuses to register in a browser without service workers", async () => {
    installServiceWorker(undefined);

    expect(await new BrowserServiceWorkerHost().register()).toEqual({ ok: false, error: { code: "unsupported" } });
  });

  it("registers /sw.js for the whole site and asks the browser to check the file against the network", async () => {
    const result = await new BrowserServiceWorkerHost().register();

    expect(result).toEqual({ ok: true, value: undefined });
    expect(container.register).toHaveBeenCalledWith("/sw.js", { scope: "/", updateViaCache: "none" });
  });

  it("reports a registration failure", async () => {
    container.register.mockRejectedValue(new Error("SecurityError"));

    expect(await new BrowserServiceWorkerHost().register()).toEqual({
      ok: false,
      error: { code: "registration-failed" },
    });
  });

  describe("update detection", () => {
    const startedHost = async () => {
      const host = new BrowserServiceWorkerHost(vi.fn());
      const listener = vi.fn();
      host.onUpdateAvailable(listener);
      await host.register();
      return { host, listener };
    };

    const installNewWorker = (state: string) => {
      const worker = new FakeWorker();
      container.registration.installing = worker;
      container.registration.dispatchEvent(new Event("updatefound"));
      worker.state = state;
      worker.dispatchEvent(new Event("statechange"));
    };

    it("notifies when a new version finishes installing while the page is controlled", async () => {
      container.controller = {};
      const { listener } = await startedHost();

      installNewWorker("installed");

      expect(listener).toHaveBeenCalledOnce();
    });

    it("does not notify on the very first install: there is no older version to replace", async () => {
      container.controller = null;
      const { listener } = await startedHost();

      installNewWorker("installed");

      expect(listener).not.toHaveBeenCalled();
    });

    it("does not notify while the new version is still installing", async () => {
      container.controller = {};
      const { listener } = await startedHost();

      installNewWorker("installing");

      expect(listener).not.toHaveBeenCalled();
    });

    it("notifies for an update that was already waiting when the page loaded", async () => {
      container.controller = {};
      container.registration.waiting = new FakeWorker();

      const { listener } = await startedHost();

      expect(listener).toHaveBeenCalledOnce();
    });

    it("stops notifying a listener that unsubscribed", async () => {
      container.controller = {};
      const host = new BrowserServiceWorkerHost(vi.fn());
      const listener = vi.fn();
      const unsubscribe = host.onUpdateAvailable(listener);
      await host.register();

      unsubscribe();
      installNewWorker("installed");

      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe("applyUpdate", () => {
    it("fails when no version is waiting", async () => {
      const host = new BrowserServiceWorkerHost(vi.fn());
      await host.register();

      expect(await host.applyUpdate()).toEqual({ ok: false, error: { code: "update-failed" } });
    });

    it("fails before the worker was registered", async () => {
      expect(await new BrowserServiceWorkerHost(vi.fn()).applyUpdate()).toEqual({
        ok: false,
        error: { code: "update-failed" },
      });
    });

    it("asks the waiting version to take over, then reloads only when it controls the page", async () => {
      const reload = vi.fn();
      const host = new BrowserServiceWorkerHost(reload);
      const waiting = new FakeWorker();
      container.registration.waiting = waiting;
      await host.register();

      expect(await host.applyUpdate()).toEqual({ ok: true, value: undefined });
      expect(waiting.postMessage).toHaveBeenCalledWith({ type: "SKIP_WAITING" });
      expect(reload).not.toHaveBeenCalled();

      container.dispatchEvent(new Event("controllerchange"));
      expect(reload).toHaveBeenCalledOnce();

      container.dispatchEvent(new Event("controllerchange")); // only once
      expect(reload).toHaveBeenCalledOnce();
    });
  });

  describe("checkForUpdate", () => {
    it("asks the browser to look for a new version", async () => {
      const host = new BrowserServiceWorkerHost(vi.fn());
      await host.register();

      await host.checkForUpdate();

      expect(container.registration.update).toHaveBeenCalledOnce();
    });

    it("does nothing before registration, and swallows a network failure", async () => {
      const host = new BrowserServiceWorkerHost(vi.fn());
      await expect(host.checkForUpdate()).resolves.toBeUndefined();

      await host.register();
      container.registration.update.mockRejectedValue(new TypeError("offline"));
      await expect(host.checkForUpdate()).resolves.toBeUndefined();
    });
  });
});

describe("BrowserConnectivity", () => {
  it("reads navigator.onLine", () => {
    const connectivity = new BrowserConnectivity();
    const spy = vi.spyOn(navigator, "onLine", "get");

    spy.mockReturnValue(false);
    expect(connectivity.isOnline()).toBe(false);
    spy.mockReturnValue(true);
    expect(connectivity.isOnline()).toBe(true);
    spy.mockRestore();
  });

  it("notifies on online and offline events until unsubscribed", () => {
    const connectivity = new BrowserConnectivity();
    const listener = vi.fn();
    const unsubscribe = connectivity.subscribe(listener);

    window.dispatchEvent(new Event("offline"));
    window.dispatchEvent(new Event("online"));
    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe();
    window.dispatchEvent(new Event("offline"));
    expect(listener).toHaveBeenCalledTimes(2);
  });
});

describe("BrowserPlatform", () => {
  const IPHONE_SAFARI =
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1";
  const IPHONE_CHROME =
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/124.0 Mobile/15E148 Safari/604.1";
  const ANDROID_CHROME =
    "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36";

  const setNavigator = (props: Partial<Record<"userAgent" | "platform" | "maxTouchPoints" | "standalone", unknown>>) => {
    for (const [key, value] of Object.entries(props)) {
      Object.defineProperty(navigator, key, { value, configurable: true });
    }
  };
  const setDisplayMode = (standalone: boolean) => {
    window.matchMedia = vi.fn().mockReturnValue({ matches: standalone }) as unknown as typeof window.matchMedia;
  };

  afterEach(() => {
    setNavigator({ userAgent: "", platform: "", maxTouchPoints: 0, standalone: undefined });
  });

  it.each([
    ["Safari on iPhone", IPHONE_SAFARI, "", 5, true],
    ["Chrome on iPhone", IPHONE_CHROME, "", 5, false],
    ["Chrome on Android", ANDROID_CHROME, "Linux armv8l", 5, false],
    ["Safari on iPad with a desktop user agent", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Version/17 Safari/605", "MacIntel", 5, true],
    ["Safari on a Mac", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Version/17 Safari/605", "MacIntel", 0, false],
  ])("isIosSafari: %s", (_label, userAgent, platform, maxTouchPoints, expected) => {
    setNavigator({ userAgent, platform, maxTouchPoints });

    expect(new BrowserPlatform().isIosSafari()).toBe(expected);
  });

  it("isStandalone: true from the home screen on iOS", () => {
    setDisplayMode(false);
    setNavigator({ standalone: true });

    expect(new BrowserPlatform().isStandalone()).toBe(true);
  });

  it("isStandalone: follows the display-mode media query elsewhere", () => {
    setNavigator({ standalone: undefined });

    setDisplayMode(true);
    expect(new BrowserPlatform().isStandalone()).toBe(true);

    setDisplayMode(false);
    expect(new BrowserPlatform().isStandalone()).toBe(false);
  });
});
