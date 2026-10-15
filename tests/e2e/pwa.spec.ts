import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { expect, test, type Page } from "@playwright/test";

/**
 * The installable app in a real browser, against the production build (the worker only registers there).
 * Each test gets a fresh browser context, so the worker and its caches start empty.
 */

/** Waits until the worker is active and controlling this page (it claims clients when it activates). */
async function waitForControl(page: Page) {
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
}

/** Every URL stored in every cache created by the app, as paths. */
async function cachedPaths(page: Page): Promise<string[]> {
  return page.evaluate(async () => {
    const paths: string[] = [];
    for (const name of await caches.keys()) {
      const cache = await caches.open(name);
      for (const request of await cache.keys()) paths.push(new URL(request.url).pathname);
    }
    return paths.sort();
  });
}

test.describe("installable app", () => {
  test("serves a manifest that points to real icons", async ({ page, request }) => {
    const response = await request.get("/manifest.webmanifest");
    expect(response.ok()).toBe(true);

    const manifest = await response.json();
    expect(manifest.display).toBe("standalone");
    expect(manifest.start_url).toBe("/");
    expect(manifest.lang).toBe("es");
    expect(manifest.icons.length).toBeGreaterThanOrEqual(3);

    for (const icon of manifest.icons as { src: string; sizes: string; type: string }[]) {
      const iconResponse = await request.get(icon.src);
      expect(iconResponse.ok(), icon.src).toBe(true);
      expect(iconResponse.headers()["content-type"]).toBe(icon.type);
    }

    await page.goto("/login");
    await expect(page.locator('link[rel="manifest"]')).toHaveCount(1);
  });

  test("serves the worker with headers that keep it fresh and confined", async ({ request }) => {
    const response = await request.get("/sw.js");

    expect(response.ok()).toBe(true);
    expect(response.headers()["content-type"]).toContain("javascript");
    expect(response.headers()["cache-control"]).toContain("no-cache");
    expect(response.headers()["service-worker-allowed"]).toBe("/");
    expect(response.headers()["content-security-policy"]).toContain("default-src 'self'");
  });
});

test.describe("service worker", () => {
  test("installs, takes control and precaches only the offline page and the icons", async ({ page }) => {
    await page.goto("/login");
    await waitForControl(page);

    expect(await cachedPaths(page)).toEqual(["/icons/icon-192.png", "/icons/icon-512.png", "/offline"]);
  });

  test("never stores pages, API responses or the session after real navigation", async ({ page, context, baseURL }) => {
    await page.goto("/login");
    await waitForControl(page);

    // A garbage cookie still makes the server answer with redirects and the session endpoint: none may be cached.
    await context.addCookies([{ name: "__session", value: "garbage", url: baseURL! }]);
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login$/);
    await page.evaluate(() => fetch("/api/auth/session", { method: "PUT" }).catch(() => undefined));
    await page.goto("/no-such-planet");

    const paths = await cachedPaths(page);
    const unexpected = paths.filter(
      (path) =>
        !(path === "/offline" || path.startsWith("/icons/") || path.startsWith("/_next/static/")),
    );
    expect(unexpected).toEqual([]);
  });

  test("keeps the app shell files after the first visit, cache-first", async ({ page }) => {
    await page.goto("/login");
    await waitForControl(page);
    await page.reload();

    const paths = await cachedPaths(page);
    expect(paths.some((path) => path.startsWith("/_next/static/"))).toBe(true);
  });

  test("shows the offline page when a navigation cannot reach the network", async ({ page, context }) => {
    await page.goto("/login");
    await waitForControl(page);

    await context.setOffline(true);
    await page.goto("/login");

    await expect(page.getByRole("heading", { level: 1, name: "Estás sin conexión" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Reintentar" })).toHaveAttribute("href", "/");
    // The offline page already says it, so the strip must not repeat it.
    await expect(page.getByRole("status")).toHaveCount(0);

    await context.setOffline(false);
    await page.getByRole("link", { name: "Reintentar" }).click();
    await expect(page).toHaveURL(/\/login$/);
  });

  test("shows the no-connection strip when the connection drops on a loaded page", async ({ page, context }) => {
    await page.goto("/login");
    await waitForControl(page);

    await context.setOffline(true);
    await expect(page.getByRole("status")).toContainText("Sin conexión");

    await context.setOffline(false);
    await expect(page.getByRole("status")).toHaveCount(0);
  });
});

/**
 * A tiny server in front of the app that can answer `/sw.js` with a different version, the way the
 * next deploy would. The browser sees a real network response, so the real update flow runs.
 */
async function startVersionedProxy(target: string) {
  let version: string | null = null;
  const server: Server = createServer(async (req, res) => {
    const upstream = await fetch(new URL(req.url ?? "/", target), { redirect: "manual" });
    let body = Buffer.from(await upstream.arrayBuffer());
    if (version && req.url === "/sw.js") {
      body = Buffer.from(body.toString().replace(/const VERSION = "[^"]*";/, `const VERSION = "${version}";`));
    }
    const headers: Record<string, string> = {};
    upstream.headers.forEach((value, key) => {
      if (!["content-encoding", "content-length", "transfer-encoding", "connection"].includes(key)) headers[key] = value;
    });
    res.writeHead(upstream.status, headers);
    res.end(body);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    origin: `http://localhost:${port}`,
    publish(next: string) {
      version = next;
    },
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

test.describe("new version", () => {
  test("offers the update, applies it on request and keeps the app working", async ({ page, baseURL }) => {
    const proxy = await startVersionedProxy(baseURL!);
    try {
      await page.goto(`${proxy.origin}/login`);
      await waitForControl(page);
      expect(await page.evaluate(() => caches.keys())).toEqual(["devfest-1"]);

      proxy.publish("e2e-next");
      await page.evaluate(async () => {
        const registration = await navigator.serviceWorker.getRegistration();
        await registration?.update();
      });

      const prompt = page.getByRole("button", { name: "Actualizar" });
      await expect(prompt).toBeVisible({ timeout: 15_000 });
      // The new version waits: nothing changed under the user until they accept.
      expect(await page.evaluate(() => caches.keys())).toContain("devfest-1");

      await Promise.all([page.waitForEvent("load"), prompt.click()]);

      // The old version's cache is gone and the new one has the precache, so offline still works.
      await expect.poll(() => page.evaluate(() => caches.keys())).toEqual(["devfest-e2e-next"]);
      await expect(page.getByRole("heading", { level: 1, name: "Únete a la misión" })).toBeVisible();
      expect(await cachedPaths(page)).toContain("/offline");
    } finally {
      await proxy.close();
    }
  });
});
