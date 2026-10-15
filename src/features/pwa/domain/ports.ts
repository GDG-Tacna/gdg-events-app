import type { Result } from "@/shared/lib/result";

export type PwaErrorCode = "unsupported" | "registration-failed" | "update-failed";

export interface PwaError {
  code: PwaErrorCode;
}

export const pwaError = (code: PwaErrorCode): PwaError => ({ code });

/** The browser service worker, behind a port so the flow can be tested without a browser. */
export interface ServiceWorkerHost {
  /** False in browsers without service workers (and on the server). */
  readonly supported: boolean;
  /** Registers the worker. A page that is already controlled by a worker may later receive updates. */
  register(): Promise<Result<void, PwaError>>;
  /** Called when a new version finished installing and is waiting. Returns the unsubscribe function. */
  onUpdateAvailable(listener: () => void): () => void;
  /** Asks the waiting version to take over; the adapter reloads the page once it controls it. */
  applyUpdate(): Promise<Result<void, PwaError>>;
  /** Looks for a new version now (called when the user comes back to the app). */
  checkForUpdate(): Promise<void>;
}

/** Network status, shaped for `useSyncExternalStore`. */
export interface Connectivity {
  isOnline(): boolean;
  subscribe(listener: () => void): () => void;
}

/** What the browser says about how the app is running. Used to decide which install hint applies. */
export interface PlatformInfo {
  /** Already opened from the home screen. */
  isStandalone(): boolean;
  /** Safari on iPhone or iPad, where there is no install prompt and the user must add it by hand. */
  isIosSafari(): boolean;
}
