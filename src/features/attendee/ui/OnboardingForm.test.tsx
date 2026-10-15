// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthActionsProvider, type AuthActions } from "@/features/auth";
import { copy } from "@/shared/copy/es";
import { err, ok } from "@/shared/lib/result";
import { axe } from "@/test-utils/axe";
import { OnboardingForm } from "./OnboardingForm";
import type { RegisterAttendeeAction, RegisterAttendeeActionResult } from "./registration";

const router = vi.hoisted(() => ({ replace: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

const refreshSession = vi.fn<AuthActions["refreshSession"]>();

function renderForm(register: RegisterAttendeeAction, nextPath?: string) {
  const actions: AuthActions = {
    signInWithGoogle: vi.fn(async () => ok("signed-in" as const)),
    completeSignIn: vi.fn(async () => ok(false)),
    refreshSession,
    signOut: vi.fn(async () => ok(undefined)),
  };
  return render(
    <AuthActionsProvider actions={actions}>
      <OnboardingForm register={register} nextPath={nextPath} />
    </AuthActionsProvider>,
  );
}

const okRegister = () => vi.fn<RegisterAttendeeAction>(async () => ({ ok: true, created: true }));
const field = () => screen.getByLabelText(copy.onboarding.aliasLabel);
const submitButton = () => screen.getByRole("button", { name: copy.onboarding.submit });

describe("OnboardingForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    refreshSession.mockResolvedValue(ok(undefined));
  });

  it("starts empty with the rules as help and no error", () => {
    renderForm(okRegister());

    expect(screen.getByRole("heading", { level: 1, name: copy.onboarding.title })).toBeInTheDocument();
    expect(field()).toHaveValue("");
    expect(field()).toHaveAccessibleDescription(copy.onboarding.aliasHint);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(submitButton()).toBeEnabled();
  });

  it("counts the characters while typing, without complaining yet", async () => {
    renderForm(okRegister());

    await userEvent.type(field(), "ab");

    expect(screen.getByText("2/16")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows the rule that fails after the user leaves the field", async () => {
    renderForm(okRegister());

    await userEvent.type(field(), "ab");
    await userEvent.tab();

    expect(screen.getByRole("alert")).toHaveTextContent(copy.onboarding.aliasErrors["too-short"]);
    expect(field()).toHaveAttribute("aria-invalid", "true");
  });

  it.each([
    ["with a space", "two words", copy.onboarding.aliasErrors["invalid-characters"]],
    ["with symbols", "nova!", copy.onboarding.aliasErrors["invalid-characters"]],
    ["reserved", "admin", copy.onboarding.aliasErrors.reserved],
  ])("rejects an alias %s on the client without calling the server", async (_label, alias, message) => {
    const register = okRegister();
    renderForm(register);

    await userEvent.type(field(), alias);
    await userEvent.click(submitButton());

    expect(screen.getByRole("alert")).toHaveTextContent(message);
    expect(register).not.toHaveBeenCalled();
    expect(field()).toHaveFocus();
  });

  it("an empty submit asks for an alias and puts the focus on the field", async () => {
    const register = okRegister();
    renderForm(register);

    await userEvent.click(submitButton());

    expect(screen.getByRole("alert")).toHaveTextContent(copy.onboarding.aliasErrors["too-short"]);
    expect(register).not.toHaveBeenCalled();
    expect(field()).toHaveFocus();
  });

  it("does not let the user type past the limit", async () => {
    renderForm(okRegister());

    await userEvent.type(field(), "a".repeat(30));

    expect(field()).toHaveValue("a".repeat(16));
  });

  it("registers, swaps the session and goes to the dashboard", async () => {
    const register = okRegister();
    renderForm(register);

    await userEvent.type(field(), "Nova_7");
    await userEvent.click(submitButton());

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/dashboard"));
    expect(register).toHaveBeenCalledWith({ alias: "Nova_7" });
    expect(refreshSession).toHaveBeenCalledOnce();
    expect(router.refresh).toHaveBeenCalledOnce();
  });

  it("goes where the app shell says next (for example the squad reveal)", async () => {
    renderForm(okRegister(), "/squad");

    await userEvent.type(field(), "Nova_7");
    await userEvent.click(submitButton());

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/squad"));
    expect(router.replace).not.toHaveBeenCalledWith("/dashboard");
  });

  it("submits with the Enter key", async () => {
    const register = okRegister();
    renderForm(register);

    await userEvent.type(field(), "Nova_7{Enter}");

    await waitFor(() => expect(register).toHaveBeenCalledOnce());
  });

  it("shows a busy button and a read-only field while registering, and ignores a second submit", async () => {
    let finish!: (result: RegisterAttendeeActionResult) => void;
    const register = vi.fn<RegisterAttendeeAction>(
      () => new Promise<RegisterAttendeeActionResult>((resolve) => (finish = resolve)),
    );
    renderForm(register);

    await userEvent.type(field(), "Nova_7");
    await userEvent.click(submitButton());

    const busy = screen.getByRole("button", { name: copy.onboarding.submitting });
    expect(busy).toBeDisabled();
    expect(busy).toHaveAttribute("aria-busy", "true");
    expect(field()).toHaveAttribute("readonly");

    // A disabled button already blocks Enter, so submit the form directly to prove the handler's own guard.
    fireEvent.submit(field().closest("form") as HTMLFormElement);
    expect(register).toHaveBeenCalledOnce();

    finish({ ok: true, created: true });
    await waitFor(() => expect(router.replace).toHaveBeenCalled());
  });

  it("shows a taken alias on the field and keeps the user on the page", async () => {
    renderForm(vi.fn<RegisterAttendeeAction>(async () => ({ ok: false, code: "alias-taken" })));

    await userEvent.type(field(), "Nova_7");
    await userEvent.click(submitButton());

    expect(await screen.findByRole("alert")).toHaveTextContent(copy.onboarding.aliasTaken);
    expect(field()).toHaveAttribute("aria-invalid", "true");
    expect(field()).toHaveFocus();
    expect(router.replace).not.toHaveBeenCalled();
    expect(submitButton()).toBeEnabled();
  });

  it("drops the taken-alias message as soon as the user edits the alias", async () => {
    renderForm(vi.fn<RegisterAttendeeAction>(async () => ({ ok: false, code: "alias-taken" })));

    await userEvent.type(field(), "Nova_7");
    await userEvent.click(submitButton());
    await screen.findByRole("alert");

    await userEvent.type(field(), "8");

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows the rule the server rejected on the field", async () => {
    renderForm(vi.fn<RegisterAttendeeAction>(async () => ({ ok: false, code: "alias-invalid", alias: "reserved" })));

    await userEvent.type(field(), "Nova_7");
    await userEvent.click(submitButton());

    expect(await screen.findByRole("alert")).toHaveTextContent(copy.onboarding.aliasErrors.reserved);
  });

  it.each([
    ["unauthenticated", copy.onboarding.errors.unauthenticated],
    ["forbidden", copy.onboarding.errors.forbidden],
    ["unknown", copy.onboarding.errors.unknown],
  ] as const)("shows a general alert for a %s failure, not on the field", async (code, message) => {
    renderForm(vi.fn<RegisterAttendeeAction>(async () => ({ ok: false, code })));

    await userEvent.type(field(), "Nova_7");
    await userEvent.click(submitButton());

    expect(await screen.findByRole("alert")).toHaveTextContent(message);
    expect(field()).not.toHaveAttribute("aria-invalid");
  });

  it("shows a general alert when only the session swap fails, and a retry works", async () => {
    refreshSession.mockResolvedValueOnce(err({ code: "network" }));
    const register = okRegister();
    renderForm(register);

    await userEvent.type(field(), "Nova_7");
    await userEvent.click(submitButton());
    expect(await screen.findByRole("alert")).toHaveTextContent(copy.onboarding.errors.unknown);
    expect(router.replace).not.toHaveBeenCalled();

    await userEvent.click(submitButton());
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/dashboard"));
    expect(register).toHaveBeenCalledTimes(2);
  });

  it("has no detectable accessibility violations (idle, invalid and server error)", async () => {
    const { container } = renderForm(vi.fn<RegisterAttendeeAction>(async () => ({ ok: false, code: "alias-taken" })));
    expect((await axe(container)).violations).toEqual([]);

    await userEvent.click(submitButton());
    await screen.findByRole("alert");
    expect((await axe(container)).violations).toEqual([]);

    await userEvent.type(field(), "Nova_7");
    await userEvent.click(submitButton());
    await screen.findByText(copy.onboarding.aliasTaken);
    expect((await axe(container)).violations).toEqual([]);
  });
});
