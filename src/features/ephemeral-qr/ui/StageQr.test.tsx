// @vitest-environment jsdom
import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { copy } from "@/shared/copy/es";
import { axe } from "@/test-utils/axe";
import type { IssueQrAction, IssueQrActionResult } from "./action";
import { StageQr } from "./StageQr";

const CELLS = ["1110", "1010", "1110", "0001"];

const showing = (remainingSeconds = 102): IssueQrActionResult => {
  const issuedAt = Date.now();
  return { ok: true, qr: { checkpointId: "keynote", name: "Keynote", cells: CELLS, issuedAt, expiresAt: issuedAt + remainingSeconds * 1000 } };
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date"] });
});
afterEach(() => {
  vi.useRealTimers();
});

async function renderStageQr(issue: IssueQrAction) {
  const view = render(<StageQr checkpointId="keynote" name="Keynote de apertura" issue={issue} />);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
  return view;
}

describe("StageQr", () => {
  it("shows the talk's name big, its code, how long it has left and what to do with it", async () => {
    const issue = vi.fn(async () => showing());
    await renderStageQr(issue);

    expect(issue).toHaveBeenCalledWith({ checkpointId: "keynote" });
    expect(screen.getByRole("heading", { name: "Keynote de apertura" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Código QR de Keynote de apertura" })).toBeInTheDocument();
    expect(screen.getByRole("timer")).toHaveTextContent("Vence en 1:42");
    expect(screen.getByText(copy.admin.qr.scanHint)).toBeInTheDocument();
  });

  it("shows the name while the first code is on its way", () => {
    render(<StageQr checkpointId="keynote" name="Keynote de apertura" issue={() => new Promise<IssueQrActionResult>(() => undefined)} />);

    expect(screen.getByRole("heading", { name: "Keynote de apertura" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(copy.admin.qr.loading);
  });

  it("says why there is no code", async () => {
    await renderStageQr(vi.fn(async () => ({ ok: false as const, code: "checkpoint-inactive" as const })));

    expect(screen.getByRole("alert")).toHaveTextContent(copy.admin.qr.errors["checkpoint-inactive"]);
  });

  it("has no detectable accessibility violations", async () => {
    // axe schedules its own timers, so this one runs on real time.
    vi.useRealTimers();
    const { container } = render(<StageQr checkpointId="keynote" name="Keynote de apertura" issue={async () => showing()} />);
    await screen.findByRole("img", { name: /Código QR/ });

    expect((await axe(container)).violations).toEqual([]);
  });
});
