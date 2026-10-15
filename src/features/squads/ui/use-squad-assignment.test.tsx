// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { AssignSquadAction } from "./assignment";
import { useSquadAssignment } from "./use-squad-assignment";

describe("useSquadAssignment", () => {
  it("starts idle when the attendee has no squad", () => {
    const { result } = renderHook(() => useSquadAssignment(vi.fn()));

    expect(result.current).toMatchObject({ status: "idle", squad: null, errorCode: null });
  });

  it("opens already revealed when the attendee has a squad, without calling the server", () => {
    const action = vi.fn();
    const { result } = renderHook(() => useSquadAssignment(action, "firebase"));

    expect(result.current).toMatchObject({ status: "revealed", squad: "firebase" });
    expect(action).not.toHaveBeenCalled();
  });

  it("goes pending, then reveals the squad the server gave", async () => {
    let finish!: (value: Awaited<ReturnType<AssignSquadAction>>) => void;
    const action: AssignSquadAction = () => new Promise((resolve) => (finish = resolve));
    const { result } = renderHook(() => useSquadAssignment(action));

    let promise!: Promise<boolean>;
    act(() => {
      promise = result.current.assign();
    });
    expect(result.current.status).toBe("pending");

    await act(async () => {
      finish({ ok: true, squad: "cloud", assigned: true });
      await promise;
    });
    expect(result.current).toMatchObject({ status: "revealed", squad: "cloud" });
  });

  it("exposes the failure code and lets the user try again", async () => {
    const action = vi
      .fn<AssignSquadAction>()
      .mockResolvedValueOnce({ ok: false, code: "unknown" })
      .mockResolvedValueOnce({ ok: true, squad: "angular", assigned: true });
    const { result } = renderHook(() => useSquadAssignment(action));

    let first = true;
    await act(async () => {
      first = await result.current.assign();
    });
    expect(first).toBe(false);
    expect(result.current).toMatchObject({ status: "error", errorCode: "unknown", squad: null });

    await act(async () => {
      await result.current.assign();
    });
    expect(result.current).toMatchObject({ status: "revealed", squad: "angular", errorCode: null });
  });
});
