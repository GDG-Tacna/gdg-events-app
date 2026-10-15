// @vitest-environment jsdom
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { copy } from "@/shared/copy/es";
import { err, ok, type Result } from "@/shared/lib/result";
import { axe } from "@/test-utils/axe";
import { fakeQrCamera } from "@/test-utils/fake-qr-camera";
import type { StationKind } from "../domain/serve";
import type { ServeAction, ServeActionResult } from "./action";
import { ServeScreen } from "./ServeScreen";

/** A fake camera that starts (or fails to start, like the real one would) and can be shown a code. */
function fakeScanner(startResult: Result<void, { code: "denied" | "no-camera" | "unsupported" | "failed" }> = ok(undefined)) {
  const fake = fakeQrCamera(startResult.ok ? undefined : startResult.error.code);
  return { scanner: fake.camera, see: fake.see, fake };
}

const served = (overrides: Partial<Extract<ServeActionResult, { ok: true }>> = {}): ServeActionResult => ({
  ok: true,
  kind: "catering",
  status: "served",
  firstEntrance: false,
  alias: "Nova_7",
  squadId: "gemini",
  servedCount: 43,
  missions: [],
  ...overrides,
});

async function renderScreen(
  serve: ServeAction = vi.fn(async () => served()),
  scanner = fakeScanner(),
  initialCount: number | null = 42,
  kind: StationKind = "catering",
) {
  const view = render(
    <ServeScreen camera={scanner.scanner} serve={serve} checkpointId="lunch-1" kind={kind} name="Almuerzo" initialCount={initialCount} backHref="/staff" />,
  );
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
  return { ...view, ...scanner, serve };
}

const vibrate = vi.fn();

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval"] });
  Object.defineProperty(navigator, "vibrate", { value: vibrate, configurable: true });
  vibrate.mockClear();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("ServeScreen while waiting", () => {
  it("shows the meal, how many rations have gone out and what to do", async () => {
    await renderScreen();

    expect(screen.getByRole("heading", { level: 1, name: "Almuerzo" })).toBeInTheDocument();
    expect(screen.getByText("42")).toBeInTheDocument();
    expect(screen.getByText(copy.staff.counterLabel.catering)).toBeInTheDocument();
    expect(screen.getByText(copy.staff.hint)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: copy.staff.back })).toHaveAttribute("href", "/staff");
  });

  it("shows a dash when the count could not be read", async () => {
    await renderScreen(undefined, undefined, null);

    expect(screen.getByText("–")).toBeInTheDocument();
  });

  it("says it is checking the pass while the server answers", async () => {
    const t = await renderScreen(vi.fn(() => new Promise<ServeActionResult>(() => undefined)));

    await t.see("devfest:at:pass");

    expect(screen.getByText(copy.staff.sending)).toBeInTheDocument();
  });
});

describe("ServeScreen results", () => {
  it("sends the scanned pass with the checkpoint, never the attendee", async () => {
    const t = await renderScreen();

    await t.see("devfest:at:pass");

    expect(t.serve).toHaveBeenCalledTimes(1);
    expect(t.serve).toHaveBeenCalledWith({ checkpointId: "lunch-1", payload: "devfest:at:pass" });
  });

  it("fills the screen green with the alias when the attendee may pass, and updates the count", async () => {
    const t = await renderScreen();

    await t.see("devfest:at:pass");

    const overlay = screen.getByRole("button", { name: copy.staff.tap });
    expect(overlay.className).toContain("bg-accent");
    expect(overlay).toHaveTextContent("Nova_7");
    expect(overlay).toHaveTextContent(copy.staff.results.catering.served);
    expect(screen.getAllByText("43").length).toBeGreaterThan(0);
    expect(vibrate).toHaveBeenCalledWith(80);
  });

  it("fills the screen amber for a second ration, and does not move the count", async () => {
    const t = await renderScreen(vi.fn(async () => served({ status: "already-served", servedCount: 42 })));

    await t.see("devfest:at:pass");

    const overlay = screen.getByRole("button", { name: copy.staff.tap });
    expect(overlay.className).toContain("bg-gold");
    expect(overlay).toHaveTextContent(copy.staff.results.catering.already);
    expect(overlay).toHaveTextContent("Nova_7");
  });

  it.each(["expired-code", "invalid-code", "not-eligible", "attendee-not-found", "rate-limited", "checkpoint-inactive", "unknown"] as const)(
    "fills the screen red with the reason for %s, and buzzes differently",
    async (code) => {
      const t = await renderScreen(vi.fn(async () => ({ ok: false, code }) as const));

      await t.see("devfest:at:pass");

      const overlay = screen.getByRole("button", { name: copy.staff.tap });
      expect(overlay.className).toContain("bg-danger");
      expect(overlay).toHaveTextContent(copy.staff.errors[code].title);
      expect(overlay).toHaveTextContent(copy.staff.errors[code].body);
      expect(vibrate).toHaveBeenCalledWith([200, 100, 200]);
    },
  );

  it("treats a server action that throws as an unknown failure instead of freezing", async () => {
    const t = await renderScreen(vi.fn(async () => Promise.reject(new Error("network"))));

    await t.see("devfest:at:pass");

    expect(screen.getByRole("button", { name: copy.staff.tap })).toHaveTextContent(copy.staff.errors.unknown.title);
  });

  it("counts a new ration itself when the server could not read the total", async () => {
    const t = await renderScreen(vi.fn(async () => served({ servedCount: null })));

    await t.see("devfest:at:pass");
    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(screen.getByText("43")).toBeInTheDocument();
  });

  it("never sends a second pass while a result is on screen", async () => {
    const t = await renderScreen();

    await t.see("pass-1");
    await t.see("pass-2");

    expect(t.serve).toHaveBeenCalledTimes(1);
  });
});

describe("ServeScreen going back to scanning", () => {
  it("clears a success by itself after a moment and looks for the next person", async () => {
    const t = await renderScreen();
    await t.see("pass-1");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1900);
    });

    expect(screen.queryByRole("button", { name: copy.staff.tap })).not.toBeInTheDocument();
    expect(t.fake.paused()).toBe(false);
  });

  it("keeps a refusal up longer, so the reason can be read", async () => {
    const t = await renderScreen(vi.fn(async () => ({ ok: false, code: "expired-code" }) as const));
    await t.see("pass-1");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1900);
    });
    expect(screen.getByRole("button", { name: copy.staff.tap })).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });
    expect(screen.queryByRole("button", { name: copy.staff.tap })).not.toBeInTheDocument();
  });

  it("tells the staff what the person lacks for the meal, and keeps it up long enough to say it", async () => {
    const t = await renderScreen(vi.fn(async () => ({ ok: false, code: "not-eligible", missing: { level: 2, levelName: "Piloto", talks: 2 } }) as const));
    await t.see("pass-1");

    const overlay = screen.getByRole("button", { name: copy.staff.tap });
    expect(overlay).toHaveTextContent(copy.staff.errors["not-eligible"].title);
    expect(overlay).toHaveTextContent("Le falta llegar a Piloto (NV 2)");
    expect(overlay).toHaveTextContent("Le faltan 2 charlas más");
    expect(overlay).not.toHaveTextContent(copy.staff.errors["not-eligible"].body);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(4900);
    });
    expect(screen.getByRole("button", { name: copy.staff.tap })).toBeInTheDocument();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });
    expect(screen.queryByRole("button", { name: copy.staff.tap })).not.toBeInTheDocument();
  });

  it("says one talk, or a level by its number when it has no name", async () => {
    const t = await renderScreen(vi.fn(async () => ({ ok: false, code: "not-eligible", missing: { level: 6, levelName: null, talks: 1 } }) as const));
    await t.see("pass-1");

    const overlay = screen.getByRole("button", { name: copy.staff.tap });
    expect(overlay).toHaveTextContent("Le falta llegar a NV 6");
    expect(overlay).toHaveTextContent("Le falta asistir a 1 charla más");
  });

  it("goes back at once on a tap", async () => {
    const t = await renderScreen();
    await t.see("pass-1");

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: copy.staff.tap }));
    });

    expect(screen.queryByRole("button", { name: copy.staff.tap })).not.toBeInTheDocument();
    expect(t.fake.paused()).toBe(false);
  });

  it("serves the next person after the screen clears", async () => {
    const t = await renderScreen();
    await t.see("pass-1");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: copy.staff.tap }));
    });

    await t.see("pass-2");

    expect(t.serve).toHaveBeenCalledTimes(2);
    expect(t.serve).toHaveBeenLastCalledWith({ checkpointId: "lunch-1", payload: "pass-2" });
  });
});

describe("ServeScreen at the entrance and at a stand", () => {
  it("counts entries at the entrance and welcomes the cadet", async () => {
    const t = await renderScreen(vi.fn(async () => served({ kind: "entrance", firstEntrance: true })), undefined, 42, "entrance");

    expect(screen.getByText(copy.staff.counterLabel.entrance)).toBeInTheDocument();
    await t.see("devfest:at:pass");
    const overlay = screen.getByRole("button", { name: copy.staff.tap });
    expect(overlay).toHaveTextContent(copy.staff.results.entrance.served);
    expect(overlay).toHaveTextContent(`${copy.staff.counterLabel.entrance}: 43`);
  });

  it("says a repeated entry or stand visit already counted", async () => {
    const t = await renderScreen(vi.fn(async () => served({ kind: "stand", status: "already-served" })), undefined, 42, "stand");

    await t.see("devfest:at:pass");
    const overlay = screen.getByRole("button", { name: copy.staff.tap });
    expect(overlay.className).toContain("bg-gold");
    expect(overlay).toHaveTextContent(copy.staff.results.stand.already);
  });

  it("lists the missions a stand visit just completed, so the staff can tell the cadet, and not the ones done before", async () => {
    const missions = [
      { title: "Visita el stand de Cloud", xpEarned: 30, justCompleted: true },
      { title: "Misión antigua", xpEarned: 0, justCompleted: false },
    ];
    const t = await renderScreen(vi.fn(async () => served({ kind: "stand", missions })), undefined, 42, "stand");

    await t.see("devfest:at:pass");
    const list = screen.getByRole("list", { name: copy.staff.missions.label });
    expect(list).toHaveTextContent("Visita el stand de Cloud · +30 XP");
    expect(list).not.toHaveTextContent("Misión antigua");
    expect(screen.getByRole("button", { name: copy.staff.tap })).toHaveTextContent(copy.staff.results.stand.served);
  });

  it("shows no missions list when the visit completed none", async () => {
    const t = await renderScreen(vi.fn(async () => served({ kind: "stand", missions: [{ title: "Ya hecha", xpEarned: 30, justCompleted: false }] })), undefined, 42, "stand");

    await t.see("devfest:at:pass");
    expect(screen.queryByRole("list", { name: copy.staff.missions.label })).not.toBeInTheDocument();
  });
});

describe("ServeScreen camera problems", () => {
  it.each(["denied", "no-camera", "unsupported", "failed"] as const)("explains a %s problem and offers to retry", async (code) => {
    await renderScreen(undefined, fakeScanner(err({ code })));

    expect(screen.getByRole("alert")).toHaveTextContent(copy.scanner.cameraErrors[code].title);
    expect(screen.getByRole("button", { name: copy.scanner.retry })).toBeInTheDocument();
    expect(screen.queryByTestId("scan-reticle")).not.toBeInTheDocument();
  });
});

describe("ServeScreen accessibility", () => {
  it("has no detectable violations while waiting and with a result on screen", async () => {
    vi.useRealTimers();
    const scanner = fakeScanner();
    const view = render(
      <ServeScreen camera={scanner.scanner} serve={vi.fn(async () => served())} checkpointId="lunch-1" kind="catering" name="Almuerzo" initialCount={3} backHref="/staff" />,
    );
    await screen.findByText(copy.staff.hint);
    expect((await axe(view.container)).violations).toEqual([]);

    await act(async () => scanner.see("pass"));
    await screen.findByRole("button", { name: copy.staff.tap });
    expect((await axe(view.container)).violations).toEqual([]);
  });
});
