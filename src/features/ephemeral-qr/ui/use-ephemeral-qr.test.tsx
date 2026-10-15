// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { IssueQrAction, IssueQrActionResult, QrView } from "./action";
import { REFRESH_BEFORE_MS, useEphemeralQr } from "./use-ephemeral-qr";

const T0 = 1_000_000;

/** A fake server clock that the tests move; codes issued now live 120 s. */
function setup() {
  const clock = { now: T0 };
  const issued: QrView[] = [];
  const issue = vi.fn<IssueQrAction>(async (): Promise<IssueQrActionResult> => {
    const qr: QrView = {
      checkpointId: "talk-1",
      name: "Keynote",
      cells: [`${issued.length}`],
      issuedAt: clock.now,
      expiresAt: clock.now + 120_000,
    };
    issued.push(qr);
    return { ok: true, qr };
  });
  const now = () => clock.now;
  const advance = async (ms: number) => {
    // Move both the fake timers and the clock the hook reads, one second at a time like a real interval.
    for (let elapsed = 0; elapsed < ms; elapsed += 1000) {
      clock.now += 1000;
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1000);
      });
    }
  };
  return { clock, issue, issued, now, advance };
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("useEphemeralQr", () => {
  it("starts loading, then shows the first code with its time left", async () => {
    const t = setup();
    const { result } = renderHook(() => useEphemeralQr(t.issue, "talk-1", t.now));
    expect(result.current.state).toEqual({ status: "loading" });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(t.issue).toHaveBeenCalledWith({ checkpointId: "talk-1" });
    expect(result.current.state).toMatchObject({ status: "showing", remainingMs: 120_000, reconnecting: false });
  });

  it("counts down against the server's clock, not the device's", async () => {
    const t = setup();
    // The device clock is 5 minutes behind the server: the code still has its full two minutes.
    const deviceNow = () => t.clock.now - 300_000; // stable, like Date.now
    const { result } = renderHook(() => useEphemeralQr(t.issue, "talk-1", deviceNow));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(result.current.state).toMatchObject({ status: "showing" });
    await t.advance(10_000);
    expect(result.current.state).toMatchObject({ status: "showing", remainingMs: 110_000 });
  });

  it("asks for the next code before the current one ends, so the screen never shows a dead code", async () => {
    const t = setup();
    const { result } = renderHook(() => useEphemeralQr(t.issue, "talk-1", t.now));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(t.issue).toHaveBeenCalledTimes(1);

    await t.advance(120_000 - REFRESH_BEFORE_MS - 2000);
    expect(t.issue).toHaveBeenCalledTimes(1);

    await t.advance(4000);
    expect(t.issue).toHaveBeenCalledTimes(2);
    expect(result.current.state).toMatchObject({ status: "showing" });
    // The new code has a full two minutes again.
    expect((result.current.state as { remainingMs: number }).remainingMs).toBeGreaterThan(115_000);
  });

  it("keeps the current code up while a refresh fails, and says it is reconnecting", async () => {
    const t = setup();
    const { result } = renderHook(() => useEphemeralQr(t.issue, "talk-1", t.now));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    t.issue.mockResolvedValue({ ok: false, code: "unknown" });
    await t.advance(120_000 - REFRESH_BEFORE_MS + 1000);

    expect(result.current.state).toMatchObject({ status: "showing", reconnecting: true });
  });

  it("recovers by itself when the server comes back, without waiting for the code to end", async () => {
    const t = setup();
    const { result } = renderHook(() => useEphemeralQr(t.issue, "talk-1", t.now));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    const working = t.issue.getMockImplementation()!;
    t.issue.mockResolvedValue({ ok: false, code: "unknown" });
    await t.advance(120_000 - REFRESH_BEFORE_MS + 1000);
    expect(result.current.state).toMatchObject({ reconnecting: true });

    t.issue.mockImplementation(working);
    await t.advance(5000);

    expect(result.current.state).toMatchObject({ status: "showing", reconnecting: false });
  });

  it("says the code expired when no new one arrived in time, instead of showing a dead code", async () => {
    const t = setup();
    const { result } = renderHook(() => useEphemeralQr(t.issue, "talk-1", t.now));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    t.issue.mockResolvedValue({ ok: false, code: "unknown" });
    await t.advance(121_000);

    expect(result.current.state).toEqual({ status: "expired" });
  });

  it("does not hammer the server while it fails: one attempt every few seconds", async () => {
    const t = setup();
    renderHook(() => useEphemeralQr(t.issue, "talk-1", t.now));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    t.issue.mockClear();
    t.issue.mockResolvedValue({ ok: false, code: "unknown" });

    await t.advance(120_000 - REFRESH_BEFORE_MS + 1000); // enters the refresh window
    const attemptsInWindow = t.issue.mock.calls.length;
    await t.advance(20_000);

    expect(t.issue.mock.calls.length - attemptsInWindow).toBeLessThanOrEqual(5);
  });

  it("stops and says why on a permanent failure (the talk was closed), even with a code on screen", async () => {
    const t = setup();
    const { result } = renderHook(() => useEphemeralQr(t.issue, "talk-1", t.now));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    t.issue.mockResolvedValue({ ok: false, code: "checkpoint-inactive" });
    await t.advance(120_000 - REFRESH_BEFORE_MS + 1000);
    expect(result.current.state).toEqual({ status: "error", code: "checkpoint-inactive" });

    t.issue.mockClear();
    await t.advance(30_000);
    expect(t.issue).not.toHaveBeenCalled();
  });

  it("shows an error when the very first code cannot be made, and retries on demand", async () => {
    const t = setup();
    t.issue.mockResolvedValueOnce({ ok: false, code: "forbidden" });
    const { result } = renderHook(() => useEphemeralQr(t.issue, "talk-1", t.now));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(result.current.state).toEqual({ status: "error", code: "forbidden" });

    await act(async () => {
      result.current.retry();
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(result.current.state).toMatchObject({ status: "showing" });
  });

  it("treats a server action that throws like a temporary failure", async () => {
    const t = setup();
    t.issue.mockRejectedValueOnce(new Error("network"));
    const { result } = renderHook(() => useEphemeralQr(t.issue, "talk-1", t.now));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(result.current.state).toEqual({ status: "error", code: "unknown" });
    await t.advance(5000);
    expect(result.current.state).toMatchObject({ status: "showing" });
  });

  it("stops asking once the screen is closed", async () => {
    const t = setup();
    const { unmount } = renderHook(() => useEphemeralQr(t.issue, "talk-1", t.now));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    unmount();
    t.issue.mockClear();

    await t.advance(150_000);

    expect(t.issue).not.toHaveBeenCalled();
  });
});
