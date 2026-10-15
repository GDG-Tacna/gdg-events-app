// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "@/test-utils/axe";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { copy } from "@/shared/copy/es";
import { err, ok, type Result } from "@/shared/lib/result";
import { authError, type AuthError } from "../domain/auth-error";
import type { SignInStatus } from "../domain/use-cases";
import { AuthActionsProvider, type AuthActions } from "./auth-context";
import { SignInPanel } from "./SignInPanel";

const router = vi.hoisted(() => ({ replace: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

type SignInResult = Result<SignInStatus, AuthError>;

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

function renderPanel(signInWithGoogle: AuthActions["signInWithGoogle"]) {
  const actions: AuthActions = {
    signInWithGoogle,
    completeSignIn: vi.fn(async () => ok(false)),
    refreshSession: vi.fn(async () => ok(undefined)),
    signOut: vi.fn(async () => ok(undefined)),
  };
  return render(
    <AuthActionsProvider actions={actions}>
      <SignInPanel />
    </AuthActionsProvider>,
  );
}

const signInButton = () => screen.getByRole("button", { name: copy.auth.signIn });

describe("SignInPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("starts idle: heading, sign-in button and no alert", () => {
    renderPanel(vi.fn(async () => ok("signed-in" as const)));

    expect(screen.getByRole("heading", { level: 1, name: copy.auth.title })).toBeInTheDocument();
    expect(signInButton()).toBeEnabled();
    expect(signInButton()).not.toHaveAttribute("aria-busy");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows a busy, disabled button while connecting and then goes to the dashboard", async () => {
    const pending = deferred<SignInResult>();
    renderPanel(vi.fn(() => pending.promise));

    await userEvent.click(signInButton());

    const busy = screen.getByRole("button", { name: copy.auth.signingIn });
    expect(busy).toBeDisabled();
    expect(busy).toHaveAttribute("aria-busy", "true");
    expect(router.replace).not.toHaveBeenCalled();

    pending.resolve(ok("signed-in" as const));
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/dashboard"));
  });

  it("shows the message for the failure and lets the user retry", async () => {
    renderPanel(vi.fn(async () => err(authError("network"))));

    await userEvent.click(signInButton());

    expect(await screen.findByRole("alert")).toHaveTextContent(copy.auth.errors.network);
    expect(signInButton()).toBeEnabled();
    expect(router.replace).not.toHaveBeenCalled();
  });

  it("shows nothing when the user closes the Google popup", async () => {
    const signIn = vi.fn(async () => err(authError("cancelled")));
    renderPanel(signIn);

    await userEvent.click(signInButton());

    await waitFor(() => expect(signIn).toHaveBeenCalledOnce());
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(signInButton()).toBeEnabled();
  });

  it("keeps showing progress and does not navigate while the browser redirects", async () => {
    renderPanel(vi.fn(async () => ok("redirecting" as const)));

    await userEvent.click(signInButton());

    expect(await screen.findByRole("button", { name: copy.auth.signingIn })).toBeDisabled();
    expect(router.replace).not.toHaveBeenCalled();
  });

  it("clears the previous error when the user tries again", async () => {
    const signIn = vi
      .fn<AuthActions["signInWithGoogle"]>()
      .mockResolvedValueOnce(err(authError("unknown")))
      .mockResolvedValueOnce(ok("signed-in" as const));
    renderPanel(signIn);

    await userEvent.click(signInButton());
    expect(await screen.findByRole("alert")).toBeInTheDocument();

    await userEvent.click(signInButton());
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/dashboard"));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("has no detectable accessibility violations (idle and error)", async () => {
    const { container } = renderPanel(vi.fn(async () => err(authError("unknown"))));
    expect((await axe(container)).violations).toEqual([]);

    await userEvent.click(signInButton());
    await screen.findByRole("alert");
    expect((await axe(container)).violations).toEqual([]);
  });
});
