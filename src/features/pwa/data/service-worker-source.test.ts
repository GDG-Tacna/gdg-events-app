import { describe, expect, it, vi } from "vitest";
import { serviceWorkerSource } from "./service-worker-source";

const ORIGIN = "https://app.test";
const OPTIONS = { version: "v42", precache: ["/offline", "/icons/icon-192.png"] };

type Handler = (event: Record<string, unknown>) => void;

/** A response that looks like a same-origin one (Node reports `default` for hand-made responses). */
function basic(body = "ok", init: ResponseInit = {}) {
  const response = new Response(body, init);
  Object.defineProperty(response, "type", { value: "basic" });
  return response;
}

const keyOf = (input: string | { url: string }) => new URL(typeof input === "string" ? input : input.url, ORIGIN).href;

/** Runs the generated worker against fakes of the worker scope, the Cache API and fetch. */
function createWorker(source = serviceWorkerSource(OPTIONS)) {
  const handlers = new Map<string, Handler>();
  const store = new Map<string, Map<string, Response>>();
  const network = vi.fn<(input: unknown) => Promise<Response>>(async () => basic("network"));
  const self = {
    location: { origin: ORIGIN },
    addEventListener: (type: string, handler: Handler) => handlers.set(type, handler),
    skipWaiting: vi.fn(),
    clients: { claim: vi.fn(async () => undefined) },
  };
  const caches = {
    open: async (name: string) => {
      const entries = store.get(name) ?? new Map<string, Response>();
      store.set(name, entries);
      return {
        addAll: async (urls: string[]) => {
          for (const url of urls) {
            const response = await network(keyOf(url));
            if (!response.ok) throw new TypeError(`addAll failed for ${url}`);
            entries.set(keyOf(url), response);
          }
        },
        put: async (request: { url: string }, response: Response) => void entries.set(keyOf(request), response),
      };
    },
    keys: async () => [...store.keys()],
    delete: async (name: string) => store.delete(name),
    match: async (input: string | { url: string }) => {
      for (const entries of store.values()) {
        const found = entries.get(keyOf(input));
        if (found) return found;
      }
      return undefined;
    },
  };

  new Function("self", "caches", "fetch", "Response", source)(self, caches, network, Response);

  const lifecycle = async (type: "install" | "activate") => {
    const waits: Promise<unknown>[] = [];
    handlers.get(type)?.({ waitUntil: (promise: Promise<unknown>) => waits.push(promise) });
    await Promise.all(waits);
  };

  const fetchEvent = async (request: { method?: string; url: string; mode?: string }) => {
    let responded: Promise<Response> | undefined;
    handlers.get("fetch")?.({
      request: { method: "GET", mode: "no-cors", ...request },
      respondWith: (promise: Promise<Response>) => (responded = promise),
    });
    return responded === undefined ? { handled: false as const } : { handled: true as const, response: await responded };
  };

  return { handlers, store, network, self, lifecycle, fetchEvent };
}

describe("service worker: install and activate", () => {
  it("precaches the offline page and the icons in a cache named after the version", async () => {
    const worker = createWorker();

    await worker.lifecycle("install");

    expect([...worker.store.keys()]).toEqual(["devfest-v42"]);
    expect([...(worker.store.get("devfest-v42")?.keys() ?? [])]).toEqual([`${ORIGIN}/offline`, `${ORIGIN}/icons/icon-192.png`]);
  });

  it("fails the install when a precached file cannot be fetched, so a broken worker is never activated", async () => {
    const worker = createWorker();
    worker.network.mockResolvedValue(basic("missing", { status: 404 }));

    await expect(worker.lifecycle("install")).rejects.toThrow();
  });

  it("deletes the caches of older versions, keeps the current one and other apps' caches, and takes control", async () => {
    const worker = createWorker();
    worker.store.set("devfest-v41", new Map());
    worker.store.set("devfest-v40", new Map());
    worker.store.set("other-app-cache", new Map());
    await worker.lifecycle("install");

    await worker.lifecycle("activate");

    expect([...worker.store.keys()].sort()).toEqual(["devfest-v42", "other-app-cache"]);
    expect(worker.self.clients.claim).toHaveBeenCalledOnce();
  });

  it("does not take over by itself: through install and activate, a new version waits for the user", async () => {
    const worker = createWorker();

    await worker.lifecycle("install");
    await worker.lifecycle("activate");

    expect(worker.self.skipWaiting).not.toHaveBeenCalled();
  });

  it("activates the waiting version only on the SKIP_WAITING message", () => {
    const worker = createWorker();

    worker.handlers.get("message")?.({ data: { type: "SOMETHING_ELSE" } });
    worker.handlers.get("message")?.({ data: undefined });
    expect(worker.self.skipWaiting).not.toHaveBeenCalled();

    worker.handlers.get("message")?.({ data: { type: "SKIP_WAITING" } });
    expect(worker.self.skipWaiting).toHaveBeenCalledOnce();
  });
});

describe("service worker: navigations", () => {
  it("goes to the network and returns what it answers, caching nothing", async () => {
    const worker = createWorker();
    await worker.lifecycle("install");
    const before = JSON.stringify([...(worker.store.get("devfest-v42")?.keys() ?? [])]);

    const result = await worker.fetchEvent({ url: `${ORIGIN}/dashboard`, mode: "navigate" });

    expect(result.handled && (await result.response.text())).toBe("network");
    expect(JSON.stringify([...(worker.store.get("devfest-v42")?.keys() ?? [])])).toBe(before);
  });

  it("never caches a page, even a successful one: pages depend on the session", async () => {
    const worker = createWorker();
    await worker.lifecycle("install");

    await worker.fetchEvent({ url: `${ORIGIN}/dashboard`, mode: "navigate" });
    await worker.fetchEvent({ url: `${ORIGIN}/squad`, mode: "navigate" });

    const cachedUrls = [...(worker.store.get("devfest-v42")?.keys() ?? [])];
    expect(cachedUrls.some((url) => url.endsWith("/dashboard") || url.endsWith("/squad"))).toBe(false);
  });

  it("falls back to the offline page when the network is down", async () => {
    const worker = createWorker();
    worker.network.mockImplementation(async (input) => basic(String(input).endsWith("/offline") ? "offline-page" : "icon"));
    await worker.lifecycle("install");
    worker.network.mockRejectedValue(new TypeError("Failed to fetch"));

    const result = await worker.fetchEvent({ url: `${ORIGIN}/dashboard`, mode: "navigate" });

    expect(result.handled && (await result.response.text())).toBe("offline-page");
  });

  it("returns a network error when there is no offline page cached either", async () => {
    const worker = createWorker();
    worker.network.mockRejectedValue(new TypeError("Failed to fetch"));

    const result = await worker.fetchEvent({ url: `${ORIGIN}/dashboard`, mode: "navigate" });

    expect(result.handled && result.response.type).toBe("error");
  });

  it("does not hide a server error behind the offline page: a 500 is shown as it is", async () => {
    const worker = createWorker();
    await worker.lifecycle("install");
    worker.network.mockResolvedValue(basic("boom", { status: 500 }));

    const result = await worker.fetchEvent({ url: `${ORIGIN}/dashboard`, mode: "navigate" });

    expect(result.handled && result.response.status).toBe(500);
  });
});

describe("service worker: static files", () => {
  it.each(["/_next/static/chunks/app.js", "/icons/icon-512.png"])("serves %s from the cache after the first fetch", async (path) => {
    const worker = createWorker();
    await worker.lifecycle("install");
    worker.network.mockClear();

    await worker.fetchEvent({ url: `${ORIGIN}${path}` });
    await worker.fetchEvent({ url: `${ORIGIN}${path}` });

    expect(worker.network).toHaveBeenCalledTimes(1);
  });

  it("does not cache a failed response for a static file", async () => {
    const worker = createWorker();
    await worker.lifecycle("install");
    worker.network.mockClear();
    worker.network.mockResolvedValue(basic("gone", { status: 404 }));

    await worker.fetchEvent({ url: `${ORIGIN}/_next/static/chunks/gone.js` });
    await worker.fetchEvent({ url: `${ORIGIN}/_next/static/chunks/gone.js` });

    expect(worker.network).toHaveBeenCalledTimes(2);
  });

  it("does not cache a response that is not same-origin basic", async () => {
    const worker = createWorker();
    await worker.lifecycle("install");
    worker.network.mockClear();
    worker.network.mockResolvedValue(new Response("cors"));

    await worker.fetchEvent({ url: `${ORIGIN}/_next/static/chunks/x.js` });
    await worker.fetchEvent({ url: `${ORIGIN}/_next/static/chunks/x.js` });

    expect(worker.network).toHaveBeenCalledTimes(2);
  });
});

describe("service worker: what it leaves alone", () => {
  it.each([
    ["API routes", { url: `${ORIGIN}/api/auth/session` }],
    ["other files", { url: `${ORIGIN}/manifest.webmanifest` }],
    ["the service worker itself", { url: `${ORIGIN}/sw.js` }],
    ["Firebase and Google requests", { url: "https://firestore.googleapis.com/v1/projects/p/databases" }],
    ["sign-in popups", { url: "https://accounts.google.com/o/oauth2/auth", mode: "navigate" }],
    ["POST requests", { url: `${ORIGIN}/api/auth/session`, method: "POST" }],
    ["PUT requests", { url: `${ORIGIN}/_next/static/x.js`, method: "PUT" }],
    ["DELETE requests", { url: `${ORIGIN}/api/auth/session`, method: "DELETE" }],
  ])("does not handle %s", async (_label, request) => {
    const worker = createWorker();
    await worker.lifecycle("install");
    worker.network.mockClear();

    const result = await worker.fetchEvent(request);

    expect(result.handled).toBe(false);
    expect(worker.network).not.toHaveBeenCalled();
  });
});

describe("serviceWorkerSource", () => {
  it("puts the version in the cache name, so every deploy gets its own cache and a new worker", () => {
    expect(serviceWorkerSource({ version: "abc", precache: [] })).toContain('"abc"');
    expect(serviceWorkerSource({ version: "abc", precache: [] })).not.toBe(serviceWorkerSource({ version: "abd", precache: [] }));
  });

  it("escapes the version, so an odd value cannot break out of the string", () => {
    const hostile = '"; alert(1); "';

    expect(() => new Function("self", "caches", "fetch", "Response", serviceWorkerSource({ version: hostile, precache: [] }))).not.toThrow();
    expect(serviceWorkerSource({ version: hostile, precache: [] })).toContain(JSON.stringify(hostile));
  });

  it("is valid JavaScript for any precache list", () => {
    for (const precache of [[], ["/a"], ["/a", "/b?x=1&y=2", '/quo"te']]) {
      expect(() => new Function("self", "caches", "fetch", "Response", serviceWorkerSource({ version: "1", precache }))).not.toThrow();
    }
  });
});
