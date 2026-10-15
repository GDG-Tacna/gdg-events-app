// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { copy } from "@/shared/copy/es";
import { err, ok } from "@/shared/lib/result";
import { authError } from "../domain/auth-error";
import { AuthActionsProvider, type AuthActions } from "./auth-context";
import { SignOutButton } from "./SignOutButton";

const router = vi.hoisted(() => ({ replace: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

function renderButton(signOut: AuthActions["signOut"], variant?: "button" | "icon") {
  const actions: AuthActions = {
    signInWithGoogle: vi.fn(async () => ok("signed-in" as const)),
    completeSignIn: vi.fn(async () => ok(false)),
    refreshSession: vi.fn(async () => ok(undefined)),
    signOut,
  };
  return render(
    <AuthActionsProvider actions={actions}>
      <SignOutButton variant={variant} />
    </AuthActionsProvider>,
  );
}

describe("SignOutButton", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("signs out, returns to login and refreshes server data", async () => {
    renderButton(vi.fn(async () => ok(undefined)));

    await userEvent.click(screen.getByRole("button", { name: copy.auth.signOut }));

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/login"));
    expect(router.refresh).toHaveBeenCalledOnce();
  });

  it("stays on the page and shows the error when the server could not close the session", async () => {
    renderButton(vi.fn(async () => err(authError("network"))));

    await userEvent.click(screen.getByRole("button", { name: copy.auth.signOut }));

    expect(await screen.findByRole("alert")).toHaveTextContent(copy.auth.errors.network);
    expect(router.replace).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: copy.auth.signOut })).toBeEnabled();
  });

  describe("as an icon on a header", () => {
    it("is a 48 px button named for screen readers, that signs out the same way", async () => {
      renderButton(vi.fn(async () => ok(undefined)), "icon");

      const button = screen.getByRole("button", { name: copy.auth.signOut });
      expect(button.className).toContain("size-12");
      expect(button).toHaveTextContent("");
      await userEvent.click(button);

      await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/login"));
    });

    it("says it is signing out and cannot be pressed twice", async () => {
      renderButton(vi.fn(() => new Promise<never>(() => undefined)), "icon");

      await userEvent.click(screen.getByRole("button", { name: copy.auth.signOut }));

      expect(await screen.findByRole("button", { name: copy.auth.signingOut })).toBeDisabled();
    });

    it("shows a failure under it and stays on the page", async () => {
      renderButton(vi.fn(async () => err(authError("network"))), "icon");

      await userEvent.click(screen.getByRole("button", { name: copy.auth.signOut }));

      expect(await screen.findByRole("alert")).toHaveTextContent(copy.auth.errors.network);
      expect(router.replace).not.toHaveBeenCalled();
    });
  });
});
