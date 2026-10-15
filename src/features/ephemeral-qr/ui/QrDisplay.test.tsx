// @vitest-environment jsdom
import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { copy } from "@/shared/copy/es";
import { axe } from "@/test-utils/axe";
import type { IssueQrAction, IssueQrActionResult } from "./action";
import { QrCodeSvg } from "./QrCodeSvg";
import { QrDisplay, formatCountdown } from "./QrDisplay";

const CELLS = ["1110", "1010", "1110", "0001"];

const showing = (remainingSeconds = 102): IssueQrActionResult => {
  const issuedAt = Date.now();
  return {
    ok: true,
    qr: { checkpointId: "talk-1", name: "Keynote", cells: CELLS, issuedAt, expiresAt: issuedAt + remainingSeconds * 1000 },
  };
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date"] });
});
afterEach(() => {
  vi.useRealTimers();
});

async function renderDisplay(issue: IssueQrAction) {
  const view = render(<QrDisplay checkpointId="talk-1" name="Keynote" issue={issue} />);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
  return view;
}

describe("formatCountdown", () => {
  it.each([
    [120_000, "2:00"],
    [102_000, "1:42"],
    [61_000, "1:01"],
    [59_001, "1:00"],
    [1, "0:01"],
    [0, "0:00"],
    [-5000, "0:00"],
  ])("%i ms reads %s", (ms, text) => {
    expect(formatCountdown(ms)).toBe(text);
  });
});

describe("QrCodeSvg", () => {
  it("draws one dark rectangle per run of dark modules, inside a white quiet zone", () => {
    const { container } = render(<QrCodeSvg cells={CELLS} label="Código" />);

    const svg = screen.getByRole("img", { name: "Código" });
    expect(svg).toHaveAttribute("viewBox", "0 0 12 12"); // 4 modules + 4 of border on each side
    expect(container.querySelector("rect")).toHaveAttribute("fill", "#ffffff");
    expect(container.querySelector("path")).toHaveAttribute(
      "d",
      "M4 4h3v1h-3z" + "M4 5h1v1h-1z" + "M6 5h1v1h-1z" + "M4 6h3v1h-3z" + "M7 7h1v1h-1z",
    );
  });

  it("draws nothing dark for an empty matrix without failing", () => {
    const { container } = render(<QrCodeSvg cells={["000", "000", "000"]} label="Vacío" />);

    expect(container.querySelector("path")).toHaveAttribute("d", "");
  });

  it("is always dark on white, whatever the theme", () => {
    const { container } = render(<QrCodeSvg cells={CELLS} label="Código" />);

    expect(container.querySelector("path")).toHaveAttribute("fill", "#050816");
  });
});

describe("QrDisplay", () => {
  it("shows the talk's name and a loading state while the first code is made", () => {
    render(<QrDisplay checkpointId="talk-1" name="Keynote" issue={() => new Promise(() => undefined)} />);

    expect(screen.getByRole("heading", { level: 1, name: "Keynote" })).toBeInTheDocument();
    expect(screen.getByText(copy.admin.qr.loading)).toBeInTheDocument();
  });

  it("shows the code, how long it has left and what to do with it", async () => {
    await renderDisplay(vi.fn(async () => showing(102)));

    expect(screen.getByRole("img", { name: "Código QR de Keynote" })).toBeInTheDocument();
    expect(screen.getByRole("timer")).toHaveTextContent("Vence en 1:42");
    expect(screen.getByRole("progressbar", { name: copy.admin.qr.timeLabel })).toHaveAttribute("aria-valuenow", "102");
    expect(screen.getByText(copy.admin.qr.scanHint)).toBeInTheDocument();
  });

  it("counts down every second without announcing each tick to screen readers", async () => {
    await renderDisplay(vi.fn(async () => showing(102)));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });

    expect(screen.getByRole("timer")).toHaveTextContent("Vence en 1:39");
    expect(screen.getByRole("timer")).toHaveAttribute("aria-live", "off");
  });

  it("explains a failure and offers to try again", async () => {
    const issue = vi.fn<IssueQrAction>(async () => ({ ok: false, code: "forbidden" }));
    await renderDisplay(issue);

    expect(screen.getByRole("alert")).toHaveTextContent(copy.admin.qr.errors.forbidden);
    expect(screen.getByRole("button", { name: copy.admin.qr.retry })).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: /Código QR/ })).not.toBeInTheDocument();
  });

  it("never shows a dead code: when it ends without a new one it says so", async () => {
    const issue = vi.fn<IssueQrAction>(async () => showing(3));
    await renderDisplay(issue);
    issue.mockResolvedValue({ ok: false, code: "unknown" });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });

    expect(screen.getByText(copy.admin.qr.expired)).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: /Código QR/ })).not.toBeInTheDocument();
  });

  it("offers full screen for the projector, and carries on if the browser refuses", async () => {
    await renderDisplay(vi.fn(async () => showing()));
    const request = vi.fn(async () => {
      throw new Error("not allowed");
    });
    Object.defineProperty(document.documentElement, "requestFullscreen", { value: request, configurable: true });

    await act(async () => {
      screen.getByRole("button", { name: copy.admin.qr.fullscreen }).click();
    });

    expect(request).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("img", { name: /Código QR/ })).toBeInTheDocument();
  });

  it("has no detectable accessibility violations", async () => {
    // axe schedules its own timers, so this one runs on real time.
    vi.useRealTimers();
    const { container } = render(<QrDisplay checkpointId="talk-1" name="Keynote" issue={async () => showing()} />);
    await screen.findByRole("img", { name: /Código QR/ });

    expect((await axe(container)).violations).toEqual([]);
  });
});
