import { err, ok, type Result } from "@/shared/lib/result";
import { pwaError, type PwaError, type ServiceWorkerHost } from "../domain/ports";

const SCRIPT_URL = "/sw.js";

/** Adapter over `navigator.serviceWorker`. Everything browser-specific stays in this file. */
export class BrowserServiceWorkerHost implements ServiceWorkerHost {
  private registration: ServiceWorkerRegistration | null = null;
  private readonly listeners = new Set<() => void>();

  /** `reload` is injected so tests do not have to navigate. */
  constructor(private readonly reload: () => void = () => window.location.reload()) {}

  get supported(): boolean {
    return typeof navigator !== "undefined" && "serviceWorker" in navigator;
  }

  async register(): Promise<Result<void, PwaError>> {
    if (!this.supported) return err(pwaError("unsupported"));

    try {
      // `updateViaCache: "none"` makes the browser check the worker file against the network every time.
      const registration = await navigator.serviceWorker.register(SCRIPT_URL, {
        scope: "/",
        updateViaCache: "none",
      });
      this.registration = registration;

      // A version that finished installing before this page loaded.
      if (registration.waiting && navigator.serviceWorker.controller) this.notify();

      registration.addEventListener("updatefound", () => {
        const installing = registration.installing;
        installing?.addEventListener("statechange", () => {
          // "installed" with a controller present means this is an update, not the first install.
          if (installing.state === "installed" && navigator.serviceWorker.controller) this.notify();
        });
      });
      return ok(undefined);
    } catch {
      return err(pwaError("registration-failed"));
    }
  }

  onUpdateAvailable(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  async applyUpdate(): Promise<Result<void, PwaError>> {
    const waiting = this.registration?.waiting;
    if (!waiting) return err(pwaError("update-failed"));

    // Reload once the new worker controls the page, so the page and its worker are the same version.
    navigator.serviceWorker.addEventListener("controllerchange", () => this.reload(), { once: true });
    waiting.postMessage({ type: "SKIP_WAITING" });
    return ok(undefined);
  }

  async checkForUpdate(): Promise<void> {
    try {
      await this.registration?.update();
    } catch {
      // Offline or the worker file is unreachable: nothing to update right now.
    }
  }

  private notify(): void {
    for (const listener of this.listeners) listener();
  }
}
