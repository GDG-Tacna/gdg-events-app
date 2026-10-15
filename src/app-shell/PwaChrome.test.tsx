// @vitest-environment jsdom
import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { copy } from "@/shared/copy/es";
import { createConnectivity, createHost, renderWithPwa } from "@/test-utils/pwa";
import { PwaChrome } from "./PwaChrome";

describe("PwaChrome", () => {
  it("shows nothing when the device is online and there is no update", async () => {
    const { host, container } = renderWithPwa(<PwaChrome />);
    await waitFor(() => expect(host.host.register).toHaveBeenCalled());

    expect(container).toBeEmptyDOMElement();
  });

  it("shows the no-connection strip, marked so the offline page can hide it", () => {
    renderWithPwa(<PwaChrome />, { connectivity: createConnectivity(false) });

    const strip = screen.getByRole("status");
    expect(strip).toHaveTextContent(copy.pwa.offlineTitle);
    expect(strip).toHaveAttribute("data-offline-banner");
  });

  it("shows the new-version prompt", async () => {
    const host = createHost();
    renderWithPwa(<PwaChrome />, { host });
    await waitFor(() => expect(host.host.register).toHaveBeenCalled());

    host.emitUpdate();

    expect(screen.getByRole("button", { name: copy.pwa.updateAction })).toBeInTheDocument();
  });
});
