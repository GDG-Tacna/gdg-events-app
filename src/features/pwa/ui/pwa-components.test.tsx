// @vitest-environment jsdom
import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { copy } from "@/shared/copy/es";
import { err, ok, type Result } from "@/shared/lib/result";
import { axe } from "@/test-utils/axe";
import { createConnectivity, createHost, platform, renderWithPwa } from "@/test-utils/pwa";
import { pwaError, type PwaError } from "../domain/ports";
import { InstallHint } from "./InstallHint";
import { OfflineBanner } from "./OfflineBanner";
import { UpdatePrompt } from "./UpdatePrompt";

describe("UpdatePrompt", () => {
  it("shows nothing while there is no update", async () => {
    const { host, container } = renderWithPwa(<UpdatePrompt />);
    await waitFor(() => expect(host.host.register).toHaveBeenCalled());

    expect(container).toBeEmptyDOMElement();
  });

  it("announces a new version politely and offers to update", async () => {
    const { host } = renderWithPwa(<UpdatePrompt />);
    await waitFor(() => expect(host.host.register).toHaveBeenCalled());

    host.emitUpdate();

    const prompt = screen.getByRole("status");
    expect(prompt).toHaveAttribute("aria-live", "polite");
    expect(prompt).toHaveTextContent(copy.pwa.updateTitle);
    expect(prompt).toHaveTextContent(copy.pwa.updateBody);
    expect(screen.getByRole("button", { name: copy.pwa.updateAction })).toBeEnabled();
  });

  it("does not update by itself: nothing is applied until the user taps", async () => {
    const { host } = renderWithPwa(<UpdatePrompt />);
    await waitFor(() => expect(host.host.register).toHaveBeenCalled());

    host.emitUpdate();

    expect(host.host.applyUpdate).not.toHaveBeenCalled();
  });

  it("applies the update when tapped, with a busy button meanwhile", async () => {
    let finish!: () => void;
    const host = createHost({
      applyUpdate: vi.fn(() => new Promise<Result<void, PwaError>>((resolve) => (finish = () => resolve(ok(undefined))))),
    });
    renderWithPwa(<UpdatePrompt />, { host });
    await waitFor(() => expect(host.host.register).toHaveBeenCalled());
    host.emitUpdate();

    await userEvent.click(screen.getByRole("button", { name: copy.pwa.updateAction }));

    const busy = screen.getByRole("button", { name: copy.pwa.updating });
    expect(busy).toBeDisabled();
    expect(busy).toHaveAttribute("aria-busy", "true");
    expect(host.host.applyUpdate).toHaveBeenCalledOnce();
    await act(async () => finish());
  });

  it("says so when the update fails, and lets the user try again", async () => {
    const host = createHost({
      applyUpdate: vi.fn(async (): Promise<Result<void, PwaError>> => err(pwaError("update-failed"))),
    });
    renderWithPwa(<UpdatePrompt />, { host });
    await waitFor(() => expect(host.host.register).toHaveBeenCalled());
    host.emitUpdate();

    await userEvent.click(screen.getByRole("button", { name: copy.pwa.updateAction }));

    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(copy.pwa.updateFailed));
    expect(screen.getByRole("button", { name: copy.pwa.updateAction })).toBeEnabled();
    await userEvent.click(screen.getByRole("button", { name: copy.pwa.updateAction }));
    expect(host.host.applyUpdate).toHaveBeenCalledTimes(2);
  });

  it("stays above the iPhone home bar and does not block the screen behind it", async () => {
    const { host, container } = renderWithPwa(<UpdatePrompt />);
    await waitFor(() => expect(host.host.register).toHaveBeenCalled());
    host.emitUpdate();

    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.className).toContain("pb-safe");
    expect(wrapper.className).toContain("pointer-events-none");
  });

  it("has no detectable accessibility violations (prompt and busy)", async () => {
    const { host, container } = renderWithPwa(<UpdatePrompt />);
    await waitFor(() => expect(host.host.register).toHaveBeenCalled());
    host.emitUpdate();

    expect((await axe(container)).violations).toEqual([]);
  });
});

describe("OfflineBanner", () => {
  it("shows nothing while online", () => {
    const { container } = renderWithPwa(<OfflineBanner />);

    expect(container).toBeEmptyDOMElement();
  });

  it("appears when the device loses its network and disappears when it returns", () => {
    const connectivity = createConnectivity(true);
    renderWithPwa(<OfflineBanner />, { connectivity });

    connectivity.setOnline(false);
    const banner = screen.getByRole("status");
    expect(banner).toHaveTextContent(copy.pwa.offlineTitle);
    expect(banner).toHaveTextContent(copy.pwa.offlineBody);

    connectivity.setOnline(true);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("starts visible when the page opens without a network", () => {
    renderWithPwa(<OfflineBanner />, { connectivity: createConnectivity(false) });

    expect(screen.getByRole("status")).toHaveTextContent(copy.pwa.offlineTitle);
  });

  it("keeps clear of the notch and has no accessibility violations", async () => {
    const { container } = renderWithPwa(<OfflineBanner />, { connectivity: createConnectivity(false) });

    expect(screen.getByRole("status").className).toContain("pt-safe");
    expect((await axe(container)).violations).toEqual([]);
  });
});

describe("InstallHint", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it.each([
    ["Safari on iPhone, not installed", true, false, true],
    ["Safari on iPhone, already on the home screen", true, true, false],
    ["Chrome on Android (it has its own prompt)", false, false, false],
    ["a desktop browser", false, false, false],
  ] as const)("%s", (_label, iosSafari, standalone, visible) => {
    renderWithPwa(<InstallHint />, { platform: platform(iosSafari, standalone) });

    expect(screen.queryByRole("region", { name: copy.pwa.installTitle }) !== null).toBe(visible);
  });

  it("explains the two steps in order", () => {
    renderWithPwa(<InstallHint />, { platform: platform(true, false) });

    const steps = screen.getAllByRole("listitem").map((item) => item.textContent);
    expect(steps).toEqual([copy.pwa.installStepShare, copy.pwa.installStepAdd]);
    expect(screen.getByRole("heading", { level: 2, name: copy.pwa.installTitle })).toBeInTheDocument();
  });

  it("can be dismissed with a labelled button, and stays dismissed after a reload", async () => {
    const first = renderWithPwa(<InstallHint />, { platform: platform(true, false) });

    await userEvent.click(screen.getByRole("button", { name: copy.pwa.installDismiss }));
    expect(screen.queryByRole("region", { name: copy.pwa.installTitle })).not.toBeInTheDocument();
    expect(window.localStorage.getItem("devfest.install-hint.dismissed")).toBe("1");

    first.unmount();
    renderWithPwa(<InstallHint />, { platform: platform(true, false) });
    expect(screen.queryByRole("region", { name: copy.pwa.installTitle })).not.toBeInTheDocument();
  });

  it("hides when another tab dismisses it", async () => {
    renderWithPwa(<InstallHint />, { platform: platform(true, false) });
    expect(screen.getByRole("region", { name: copy.pwa.installTitle })).toBeInTheDocument();

    act(() => {
      window.localStorage.setItem("devfest.install-hint.dismissed", "1");
      window.dispatchEvent(new Event("storage"));
    });

    expect(screen.queryByRole("region", { name: copy.pwa.installTitle })).not.toBeInTheDocument();
  });

  it("has no detectable accessibility violations", async () => {
    const { container } = renderWithPwa(<InstallHint />, { platform: platform(true, false) });

    expect((await axe(container)).violations).toEqual([]);
  });

  it("still dismisses for the visit when the browser blocks storage", async () => {
    vi.resetModules();
    const { InstallHint: FreshHint } = await import("./InstallHint");
    const { renderWithPwa: renderFresh } = await import("@/test-utils/pwa");
    const blocked = () => {
      throw new DOMException("blocked", "SecurityError");
    };
    const getItem = vi.spyOn(Storage.prototype, "getItem").mockImplementation(blocked);
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(blocked);

    renderFresh(<FreshHint />, { platform: platform(true, false) });
    expect(screen.getByRole("region", { name: copy.pwa.installTitle })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: copy.pwa.installDismiss }));

    expect(screen.queryByRole("region", { name: copy.pwa.installTitle })).not.toBeInTheDocument();
    getItem.mockRestore();
    setItem.mockRestore();
  });
});
