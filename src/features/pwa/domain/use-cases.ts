import { err, ok, type Result } from "@/shared/lib/result";
import { pwaError, type PwaError, type ServiceWorkerHost } from "./ports";

export interface PwaSession {
  /** Stops listening for updates. */
  stop(): void;
}

/**
 * Starts the service worker and reports when a new version is waiting.
 * Disabled (for example in development, where a worker would fight hot reload) resolves as unsupported
 * without touching the browser.
 */
export async function startPwa(
  deps: { host: ServiceWorkerHost; enabled: boolean },
  onUpdateAvailable: () => void,
): Promise<Result<PwaSession, PwaError>> {
  if (!deps.enabled || !deps.host.supported) return err(pwaError("unsupported"));

  // Listen before registering so an update that is already waiting is not missed.
  const stopListening = deps.host.onUpdateAvailable(onUpdateAvailable);

  const registered = await deps.host.register();
  if (!registered.ok) {
    stopListening();
    return registered;
  }
  return ok({ stop: stopListening });
}

/** Activates the waiting version. The page reloads when it takes control. */
export async function applyUpdate(deps: { host: ServiceWorkerHost }): Promise<Result<void, PwaError>> {
  return deps.host.applyUpdate();
}
