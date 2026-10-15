"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { initialPwaState, pwaReducer, type UpdateStatus } from "../domain/pwa-state";
import type { Connectivity, PlatformInfo, ServiceWorkerHost } from "../domain/ports";
import { applyUpdate as applyUpdateUseCase, startPwa } from "../domain/use-cases";

export interface PwaContextValue {
  updateStatus: UpdateStatus;
  /** The last attempt to apply the update failed (the prompt offers a retry). */
  updateFailed: boolean;
  online: boolean;
  /** Safari on iPhone or iPad, not yet on the home screen: the only place a manual install hint helps. */
  showIosInstallHint: boolean;
  /** Activates the waiting version; the page reloads when it takes over. */
  applyUpdate(): Promise<void>;
}

const PwaContext = createContext<PwaContextValue | null>(null);

export interface PwaProviderProps {
  host: ServiceWorkerHost;
  connectivity: Connectivity;
  platform: PlatformInfo;
  /** Turned off in development, where a service worker would fight hot reload. */
  enabled: boolean;
  children: ReactNode;
}

const noopSubscribe = () => () => undefined;

/** Starts the service worker and exposes update, connectivity and install-hint state to the UI. */
export function PwaProvider({ host, connectivity, platform, enabled, children }: PwaProviderProps) {
  const [state, dispatch] = useReducer(pwaReducer, initialPwaState);

  const online = useSyncExternalStore(
    connectivity.subscribe,
    () => connectivity.isOnline(),
    () => true, // the server renders as online, so hydration matches
  );
  const showIosInstallHint = useSyncExternalStore(
    noopSubscribe,
    () => platform.isIosSafari() && !platform.isStandalone(),
    () => false,
  );

  useEffect(() => {
    let cancelled = false;
    let stop: (() => void) | undefined;

    void startPwa({ host, enabled }, () => dispatch({ type: "update-available" })).then((result) => {
      if (!result.ok) return;
      if (cancelled) result.value.stop();
      else stop = result.value.stop;
    });

    // Coming back to the app is the moment to look for a new version.
    const onVisible = () => {
      if (document.visibilityState === "visible") void host.checkForUpdate();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      stop?.();
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [host, enabled]);

  const applyUpdate = useCallback(async () => {
    dispatch({ type: "update-applying" });
    const result = await applyUpdateUseCase({ host });
    if (!result.ok) dispatch({ type: "update-failed" });
  }, [host]);

  const value = useMemo<PwaContextValue>(
    () => ({ updateStatus: state.update, updateFailed: state.updateFailed, online, showIosInstallHint, applyUpdate }),
    [state.update, state.updateFailed, online, showIosInstallHint, applyUpdate],
  );

  return <PwaContext.Provider value={value}>{children}</PwaContext.Provider>;
}

export function usePwa(): PwaContextValue {
  const value = useContext(PwaContext);
  if (!value) throw new Error("usePwa must be used inside <PwaProvider>");
  return value;
}
