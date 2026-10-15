import { act, render } from "@testing-library/react";
import type { ReactNode } from "react";
import { vi } from "vitest";
import { ok, type Result } from "@/shared/lib/result";
import type {
  Connectivity,
  PlatformInfo,
  PwaError,
  ServiceWorkerHost,
} from "@/features/pwa/domain/ports";
import { PwaProvider } from "@/features/pwa/ui/pwa-context";

/** A service worker host the test controls: it can announce an update and decide how applying ends. */
export function createHost(overrides: Partial<ServiceWorkerHost> = {}) {
  let listener: (() => void) | undefined;
  const host: ServiceWorkerHost = {
    supported: true,
    register: vi.fn(async (): Promise<Result<void, PwaError>> => ok(undefined)),
    onUpdateAvailable: vi.fn((fn: () => void) => {
      listener = fn;
      return () => undefined;
    }),
    applyUpdate: vi.fn(async (): Promise<Result<void, PwaError>> => ok(undefined)),
    checkForUpdate: vi.fn(async () => undefined),
    ...overrides,
  };
  return { host, emitUpdate: () => act(() => listener?.()) };
}

export function createConnectivity(initial = true) {
  let online = initial;
  const listeners = new Set<() => void>();
  const connectivity: Connectivity = {
    isOnline: () => online,
    subscribe: (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
  return {
    connectivity,
    setOnline: (value: boolean) =>
      act(() => {
        online = value;
        listeners.forEach((fn) => fn());
      }),
  };
}

export const platform = (iosSafari: boolean, standalone: boolean): PlatformInfo => ({
  isIosSafari: () => iosSafari,
  isStandalone: () => standalone,
});

interface Options {
  host?: ReturnType<typeof createHost>;
  connectivity?: ReturnType<typeof createConnectivity>;
  platform?: PlatformInfo;
  enabled?: boolean;
}

/** Renders `ui` inside a PwaProvider wired to fakes, and hands the fakes back. */
export function renderWithPwa(ui: ReactNode, options: Options = {}) {
  const host = options.host ?? createHost();
  const connectivity = options.connectivity ?? createConnectivity();
  const view = render(
    <PwaProvider
      host={host.host}
      connectivity={connectivity.connectivity}
      platform={options.platform ?? platform(false, false)}
      enabled={options.enabled ?? true}
    >
      {ui}
    </PwaProvider>,
  );
  return { host, connectivity, ...view };
}
