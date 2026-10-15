// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthActionsProvider, type AuthActions } from "@/features/auth";
import { err, ok } from "@/shared/lib/result";
import type { RegisterAttendeeAction } from "./registration";
import { useAttendeeRegistration } from "./use-attendee-registration";

const refreshSession = vi.fn<AuthActions["refreshSession"]>();

const actions: AuthActions = {
  signInWithGoogle: vi.fn(async () => ok("signed-in" as const)),
  completeSignIn: vi.fn(async () => ok(false)),
  refreshSession,
  signOut: vi.fn(async () => ok(undefined)),
};

const wrapper = ({ children }: { children: ReactNode }) => (
  <AuthActionsProvider actions={actions}>{children}</AuthActionsProvider>
);

describe("useAttendeeRegistration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    refreshSession.mockResolvedValue(ok(undefined));
  });

  it("registers, then swaps the session cookie, and only then reports success", async () => {
    const order: string[] = [];
    const register: RegisterAttendeeAction = vi.fn(async () => {
      order.push("register");
      return { ok: true, created: true } as const;
    });
    refreshSession.mockImplementation(async () => {
      order.push("refresh");
      return ok(undefined);
    });
    const { result } = renderHook(() => useAttendeeRegistration(register), { wrapper });

    let finished = false;
    await act(async () => {
      finished = await result.current.submit("Nova_7");
    });

    expect(finished).toBe(true);
    expect(order).toEqual(["register", "refresh"]);
    expect(register).toHaveBeenCalledWith({ alias: "Nova_7" });
    expect(result.current.status).toBe("success");
  });

  it("exposes the failure and the broken alias rule, and does not refresh the session", async () => {
    const register: RegisterAttendeeAction = vi.fn(async () => ({ ok: false, code: "alias-invalid", alias: "reserved" }) as const);
    const { result } = renderHook(() => useAttendeeRegistration(register), { wrapper });

    let finished = true;
    await act(async () => {
      finished = await result.current.submit("admin");
    });

    expect(finished).toBe(false);
    expect(result.current).toMatchObject({ status: "error", errorCode: "alias-invalid", aliasError: "reserved" });
    expect(refreshSession).not.toHaveBeenCalled();
  });

  it("reports a taken alias", async () => {
    const register: RegisterAttendeeAction = vi.fn(async () => ({ ok: false, code: "alias-taken" }) as const);
    const { result } = renderHook(() => useAttendeeRegistration(register), { wrapper });

    await act(async () => {
      await result.current.submit("Nova_7");
    });

    expect(result.current).toMatchObject({ status: "error", errorCode: "alias-taken", aliasError: null });
  });

  it("reports an error when only the cookie swap fails (the retry is safe)", async () => {
    const register: RegisterAttendeeAction = vi.fn(async () => ({ ok: true, created: true }) as const);
    refreshSession.mockResolvedValue(err({ code: "network" }));
    const { result } = renderHook(() => useAttendeeRegistration(register), { wrapper });

    let finished = true;
    await act(async () => {
      finished = await result.current.submit("Nova_7");
    });

    expect(finished).toBe(false);
    expect(result.current).toMatchObject({ status: "error", errorCode: "unknown" });
  });

  it("clears the previous error when the user submits again", async () => {
    const register = vi
      .fn<RegisterAttendeeAction>()
      .mockResolvedValueOnce({ ok: false, code: "alias-taken" })
      .mockResolvedValueOnce({ ok: true, created: true });
    const { result } = renderHook(() => useAttendeeRegistration(register), { wrapper });

    await act(async () => {
      await result.current.submit("Nova_7");
    });
    expect(result.current.errorCode).toBe("alias-taken");

    await act(async () => {
      await result.current.submit("Nova_8");
    });
    expect(result.current).toMatchObject({ status: "success", errorCode: null });
  });
});
