// @vitest-environment jsdom
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RecordCheckInAction, RecordCheckInActionResult } from "@/features/checkins";
import { copy } from "@/shared/copy/es";
import { err, ok, type Result } from "@/shared/lib/result";
import { axe } from "@/test-utils/axe";
import { fakeQrCamera } from "@/test-utils/fake-qr-camera";
import type { CameraError } from "../domain/camera";
import type { QrCamera } from "./qr-camera";
import { ScannerView, messageFor } from "./ScannerView";

/** A fake camera that starts (or fails to start, like the real one would) and can be shown a code. */
function fakeScanner(startResult: Result<void, CameraError> = ok(undefined)) {
  const fake = fakeQrCamera(startResult.ok ? undefined : startResult.error.code);
  return { scanner: fake.camera, see: fake.see, fake };
}

const result = (overrides: Partial<Extract<RecordCheckInActionResult, { ok: true }>> = {}): RecordCheckInActionResult => ({
  ok: true,
  checkpointId: "talk-1",
  kind: "talk",
  recorded: true,
  firstEntrance: false,
  ...overrides,
});

async function renderView(scanner: QrCamera, record: RecordCheckInAction = vi.fn(async () => result())) {
  const view = render(<ScannerView camera={scanner} record={record} homeHref="/dashboard" />);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
  return view;
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval"] });
});
afterEach(() => {
  vi.useRealTimers();
});

describe("messageFor", () => {
  it.each([
    [{ ok: true, kind: "entrance", recorded: true, firstEntrance: true, missions: [], talkCredits: 0, achievements: [] }, copy.scanner.success.firstEntrance],
    [{ ok: true, kind: "entrance", recorded: true, firstEntrance: false, missions: [], talkCredits: 0, achievements: [] }, copy.scanner.success.entrance],
    [{ ok: true, kind: "talk", recorded: true, firstEntrance: false, missions: [], talkCredits: 0, achievements: [] }, copy.scanner.success.talk],
    [{ ok: true, kind: "catering", recorded: true, firstEntrance: false, missions: [], talkCredits: 0, achievements: [] }, copy.scanner.success.catering],
    [{ ok: true, kind: "stand", recorded: true, firstEntrance: false, missions: [], talkCredits: 0, achievements: [] }, copy.scanner.success.stand],
    [{ ok: true, kind: "talk", recorded: false, firstEntrance: false, missions: [], talkCredits: 0, achievements: [] }, copy.scanner.already],
    [{ ok: true, kind: "entrance", recorded: false, firstEntrance: false, missions: [], talkCredits: 0, achievements: [] }, copy.scanner.already],
    [{ ok: false, code: "expired-code" }, copy.scanner.errors["expired-code"]],
    [{ ok: false, code: "rate-limited" }, copy.scanner.errors["rate-limited"]],
  ] as const)("%j says the right thing", (outcome, expected) => {
    expect(messageFor(outcome)).toEqual(expected);
  });
});

describe("ScannerView while looking", () => {
  it("shows the camera with the reticle, and tells the person what to do", async () => {
    const { scanner } = fakeScanner();
    await renderView(scanner);

    expect(screen.getByRole("heading", { level: 1, name: copy.scanner.title })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: copy.scanner.videoLabel })).toBeInTheDocument();
    expect(screen.getByTestId("scan-reticle")).toBeInTheDocument();
    expect(screen.getByText(copy.scanner.hint)).toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 2 })).not.toBeInTheDocument();
  });

  it("says it is checking the code while the server answers", async () => {
    const { scanner, see } = fakeScanner();
    await renderView(scanner, vi.fn<RecordCheckInAction>(() => new Promise(() => undefined)));

    await see("devfest:cp:entrance-main");

    expect(screen.getByText(copy.scanner.sending)).toBeInTheDocument();
  });
});

describe("ScannerView results", () => {
  it("confirms a check-in and moves focus to the result so it is read out", async () => {
    const { scanner, see } = fakeScanner();
    await renderView(scanner, vi.fn(async () => result({ kind: "entrance", firstEntrance: true })));

    await see("devfest:cp:entrance-main");

    const heading = screen.getByRole("heading", { level: 2, name: copy.scanner.success.firstEntrance.title });
    expect(heading).toHaveFocus();
    expect(screen.getByText(copy.scanner.success.firstEntrance.body)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: copy.scanner.toHome })).toHaveAttribute("href", "/dashboard");
  });

  it("says a repeat is not an error: it already counted", async () => {
    const { scanner, see } = fakeScanner();
    await renderView(scanner, vi.fn(async () => result({ recorded: false })));

    await see("devfest:cp:talk-1");

    expect(screen.getByRole("heading", { level: 2, name: copy.scanner.already.title })).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: copy.scanner.missions.label })).not.toBeInTheDocument();
  });

  it("says how many G-Credits a talk paid, and nothing when it paid none", async () => {
    const { scanner, see } = fakeScanner();
    await renderView(scanner, vi.fn(async () => result({ kind: "talk", talkCredits: 10 })));

    await see("devfest:eq:talk-1");

    expect(screen.getByText("+10 G-Credits por asistir a esta charla")).toBeInTheDocument();
  });

  it("celebrates the badges a scan unlocked, linking to Logros when it is on", async () => {
    const { scanner, see } = fakeScanner();
    render(
      <ScannerView
        camera={scanner}
        record={vi.fn(async () => result({ kind: "talk", achievements: [{ id: "oyente", name: "Oyente cósmico", tone: "violet" }] }))}
        homeHref="/dashboard"
        achievementsHref="/achievements"
      />,
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    await see("devfest:eq:talk-1");

    expect(screen.getByText(copy.achievements.unlocked.title)).toBeInTheDocument();
    expect(screen.getByRole("list", { name: copy.achievements.unlocked.label })).toHaveTextContent("Oyente cósmico");
    expect(screen.getByRole("link", { name: copy.achievements.unlocked.see })).toHaveAttribute("href", "/achievements");
  });

  it("says nothing about badges when the scan unlocked none", async () => {
    const { scanner, see } = fakeScanner();
    await renderView(scanner, vi.fn(async () => result({ kind: "talk" })));

    await see("devfest:eq:talk-1");
    expect(screen.queryByText(copy.achievements.unlocked.title)).not.toBeInTheDocument();
  });

  it("says nothing about G-Credits when a talk paid none (already paid, or credits off)", async () => {
    const { scanner, see } = fakeScanner();
    await renderView(scanner, vi.fn(async () => result({ kind: "talk", talkCredits: 0 })));

    await see("devfest:eq:talk-1");

    expect(screen.queryByText(/G-Credits por asistir/)).not.toBeInTheDocument();
  });

  it("lists the missions the scan completed, with the XP of the new ones only", async () => {
    const { scanner, see } = fakeScanner();
    const missions = [
      { title: "Visita el stand de AI", xpEarned: 30, creditsEarned: 10, justCompleted: true },
      { title: "Asiste a la charla", xpEarned: 50, creditsEarned: 10, justCompleted: false },
    ];
    await renderView(scanner, vi.fn(async () => result({ kind: "stand", missions })));

    await see("devfest:cp:stand-ai-1");

    expect(screen.getByRole("heading", { level: 2, name: copy.scanner.success.stand.title })).toBeInTheDocument();
    const items = within(screen.getByRole("list", { name: copy.scanner.missions.label })).getAllByRole("listitem");
    expect(items[0]).toHaveTextContent(`${copy.scanner.missions.completed}Visita el stand de AI+30 XP+10 G-Credits`);
    expect(items[1]).toHaveTextContent(`${copy.scanner.missions.already}Asiste a la charla`);
    expect(items[1]).not.toHaveTextContent("XP");
  });

  it.each(["invalid-code", "expired-code", "checkpoint-inactive", "not-registered", "rate-limited", "unknown"] as const)(
    "explains a %s refusal in words",
    async (code) => {
      const { scanner, see } = fakeScanner();
      await renderView(scanner, vi.fn(async () => ({ ok: false, code }) as const));

      await see("code");

      expect(screen.getByRole("heading", { level: 2, name: copy.scanner.errors[code].title })).toBeInTheDocument();
      expect(screen.getByText(copy.scanner.errors[code].body)).toBeInTheDocument();
    },
  );

  it("goes back to looking for the next code", async () => {
    const { scanner, see, fake } = fakeScanner();
    await renderView(scanner);
    await see("code-1");
    expect(fake.paused()).toBe(true);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: copy.scanner.scanAgain }));
    });

    expect(fake.paused()).toBe(false);
    expect(screen.queryByRole("heading", { level: 2 })).not.toBeInTheDocument();
    expect(screen.getByText(copy.scanner.hint)).toBeInTheDocument();
  });

  it("offers to try again after a refusal", async () => {
    const { scanner, see } = fakeScanner();
    render(<ScannerView camera={scanner} record={vi.fn(async () => ({ ok: false, code: "expired-code" }) as const)} homeHref="/dashboard" networkHref="/red" />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    await see("old-code");

    expect(screen.getByRole("button", { name: copy.scanner.retry })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: copy.scanner.scanAgain })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: copy.scanner.toNetwork })).not.toBeInTheDocument();
  });

  it("points a cadet's contact code to the Red, when it is on", async () => {
    const { scanner, see } = fakeScanner();
    const record = vi.fn(async () => ({ ok: false, code: "contact-code" }) as const);
    const view = render(<ScannerView camera={scanner} record={record} homeHref="/dashboard" networkHref="/red" />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    await see("devfest:ct:someone");

    expect(screen.getByRole("heading", { level: 2, name: copy.scanner.errors["contact-code"].title })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: copy.scanner.toNetwork })).toHaveAttribute("href", "/red");
    view.unmount();
  });

  it("points a printed station code to the cadet's own QR, which staff scan there", async () => {
    const { scanner, see } = fakeScanner();
    const record = vi.fn(async () => ({ ok: false, code: "staff-station" }) as const);
    const view = render(<ScannerView camera={scanner} record={record} homeHref="/dashboard" passHref="/pass" />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    await see("devfest:cp:lunch-1");

    expect(screen.getByRole("heading", { level: 2, name: copy.scanner.errors["staff-station"].title })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: copy.scanner.toPass })).toHaveAttribute("href", "/pass");
    // Scanning again steps back: the way forward is the QR.
    expect(screen.getByRole("button", { name: copy.scanner.retry }).className).not.toContain("bg-primary");
    view.unmount();
  });

  it("does not offer the cadet's QR for other refusals", async () => {
    const { scanner, see } = fakeScanner();
    const view = render(<ScannerView camera={scanner} record={vi.fn(async () => ({ ok: false, code: "expired-code" }) as const)} homeHref="/dashboard" passHref="/pass" />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    await see("old-code");

    expect(screen.queryByRole("link", { name: copy.scanner.toPass })).not.toBeInTheDocument();
    view.unmount();
  });
});

describe("ScannerView camera problems", () => {
  it.each(["denied", "no-camera", "unsupported", "failed"] as const)("explains a %s problem and offers a way out", async (code) => {
    const { scanner } = fakeScanner(err({ code }));
    await renderView(scanner);

    expect(screen.getByRole("heading", { level: 2, name: copy.scanner.cameraErrors[code].title })).toHaveFocus();
    expect(screen.getByText(copy.scanner.cameraErrors[code].body)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: copy.scanner.retry })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: copy.scanner.toHome })).toBeInTheDocument();
    expect(screen.queryByTestId("scan-reticle")).not.toBeInTheDocument();
  });

  it("tries the camera again on request", async () => {
    const { scanner, fake } = fakeScanner(err({ code: "denied" }));
    await renderView(scanner);
    fake.record.failWith = undefined;

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: copy.scanner.retry }));
    });

    expect(fake.record.mounts).toBe(2);
    expect(screen.getByText(copy.scanner.hint)).toBeInTheDocument();
  });
});

describe("ScannerView accessibility", () => {
  it("has no detectable violations while looking, with a result, and with a camera problem", async () => {
    vi.useRealTimers();
    const looking = fakeScanner();
    const view = render(<ScannerView camera={looking.scanner} record={vi.fn(async () => result())} homeHref="/dashboard" />);
    await screen.findByText(copy.scanner.hint);
    expect((await axe(view.container)).violations).toEqual([]);

    await act(async () => looking.see("code"));
    await screen.findByRole("heading", { level: 2 });
    expect((await axe(view.container)).violations).toEqual([]);
    view.unmount();

    const denied = render(<ScannerView camera={fakeScanner(err({ code: "denied" })).scanner} record={vi.fn()} homeHref="/dashboard" />);
    await screen.findByRole("heading", { level: 2, name: copy.scanner.cameraErrors.denied.title });
    expect((await axe(denied.container)).violations).toEqual([]);
  });
});
