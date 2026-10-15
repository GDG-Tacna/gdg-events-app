// @vitest-environment jsdom
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { err, ok, type Result } from "@/shared/lib/result";
import {
  pwaError,
  type Connectivity,
  type PlatformInfo,
  type PwaError,
  type ServiceWorkerHost,
} from "../domain/ports";
import { PwaProvider, usePwa } from "./pwa-context";

function createHost(overrides: Partial<ServiceWorkerHost> = {}) {
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
  return { host, unsubscribe, emitUpdate: () => act(() => listener?.()) };
}

function createConnectivity(initial = true) {
  let online = initial;
  const listeners = new Set<() => void>();
  const connectivity: Connectivity = {
    isOnline: () => online,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  return {
    connectivity,
    setOnline: (value: boolean) =>
      act(() => {
        online = value;
        listeners.forEach((listener) => listener());
      }),
    listenerCount: () => listeners.size,
  };
}

const platform = (iosSafari: boolean, standalone: boolean): PlatformInfo => ({
  isIosSafari: () => iosSafari,
  isStandalone: () => standalone,
});

function Probe() {
  const { updateStatus, online, showIosInstallHint, applyUpdate } = usePwa();
  return (
    <div>
      <p data-testid="update">{updateStatus}</p>
      <p data-testid="online">{String(online)}</p>
      <p data-testid="ios">{String(showIosInstallHint)}</p>
      <button onClick={() => void applyUpdate()}>apply</button>
    </div>
  );
}

function setup(options: { host?: ReturnType<typeof createHost>; connectivity?: ReturnType<typeof createConnectivity>; platform?: PlatformInfo; enabled?: boolean } = {}) {
  const host = options.host ?? createHost();
  const connectivity = options.connectivity ?? createConnectivity();
  const result = render(
    <PwaProvider
      host={host.host}
      connectivity={connectivity.connectivity}
      platform={options.platform ?? platform(false, false)}
      enabled={options.enabled ?? true}
    >
      <Probe />
    </PwaProvider>,
  );
  return { host, connectivity, ...result };
}

describe("PwaProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("starts the service worker once and reports no update", async () => {
    const { host } = setup();

    await waitFor(() => expect(host.host.register).toHaveBeenCalledOnce());
    expect(screen.getByTestId("update")).toHaveTextContent("none");
  });

  it("shows an update as available when the worker reports one", async () => {
    const { host } = setup();
    await waitFor(() => expect(host.host.register).toHaveBeenCalled());

    host.emitUpdate();

    expect(screen.getByTestId("update")).toHaveTextContent("available");
  });

  it("applies the update and shows it as applying while the page waits for the new version", async () => {
    let finish!: () => void;
    const host = createHost({
      applyUpdate: vi.fn(
        () => new Promise<Result<void, PwaError>>((resolve) => (finish = () => resolve(ok(undefined)))),
      ),
    });
    setup({ host });
    await waitFor(() => expect(host.host.register).toHaveBeenCalled());
    host.emitUpdate();

    await userEvent.click(screen.getByRole("button", { name: "apply" }));

    expect(host.host.applyUpdate).toHaveBeenCalledOnce();
    expect(screen.getByTestId("update")).toHaveTextContent("applying");
    await act(async () => finish());
  });

  it("goes back to available when applying fails, so the user can try again", async () => {
    const host = createHost({ applyUpdate: vi.fn(async () => err(pwaError("update-failed"))) });
    setup({ host });
    await waitFor(() => expect(host.host.register).toHaveBeenCalled());
    host.emitUpdate();

    await userEvent.click(screen.getByRole("button", { name: "apply" }));

    await waitFor(() => expect(screen.getByTestId("update")).toHaveTextContent("available"));
  });

  it("does not start anything when disabled (development)", async () => {
    const host = createHost();
    setup({ host, enabled: false });

    await act(async () => undefined);

    expect(host.host.register).not.toHaveBeenCalled();
    expect(screen.getByTestId("update")).toHaveTextContent("none");
  });

  it("follows the network status", () => {
    const connectivity = createConnectivity(true);
    setup({ connectivity });
    expect(screen.getByTestId("online")).toHaveTextContent("true");

    connectivity.setOnline(false);
    expect(screen.getByTestId("online")).toHaveTextContent("false");

    connectivity.setOnline(true);
    expect(screen.getByTestId("online")).toHaveTextContent("true");
  });

  it("checks for a new version when the user comes back to the app", async () => {
    const { host } = setup();
    await waitFor(() => expect(host.host.register).toHaveBeenCalled());

    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
    act(() => void document.dispatchEvent(new Event("visibilitychange")));
    expect(host.host.checkForUpdate).toHaveBeenCalledOnce();

    Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
    act(() => void document.dispatchEvent(new Event("visibilitychange")));
    expect(host.host.checkForUpdate).toHaveBeenCalledOnce(); // hidden does not count
  });

  it.each([
    ["Safari on iPhone, not installed", true, false, "true"],
    ["Safari on iPhone, already on the home screen", true, true, "false"],
    ["any other browser", false, false, "false"],
  ] as const)("install hint: %s", (_label, iosSafari, standalone, expected) => {
    setup({ platform: platform(iosSafari, standalone) });

    expect(screen.getByTestId("ios")).toHaveTextContent(expected);
  });

  it("cleans up on unmount: stops listening for updates and for the network", async () => {
    const host = createHost();
    const connectivity = createConnectivity();
    const view = setup({ host, connectivity });
    await waitFor(() => expect(host.host.register).toHaveBeenCalled());
    await act(async () => undefined);

    view.unmount();

    expect(host.unsubscribe).toHaveBeenCalled();
    expect(connectivity.listenerCount()).toBe(0);
  });

  it("usePwa outside the provider is a clear programming error", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    expect(() => render(<Probe />)).toThrow("usePwa must be used inside <PwaProvider>");
    spy.mockRestore();
  });
});
