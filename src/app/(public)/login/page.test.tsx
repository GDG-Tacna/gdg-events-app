import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const guards = { getSession: vi.fn() };
vi.mock("@/app-shell/guards", () => guards);

class Redirected extends Error {
  constructor(readonly to: string) {
    super(`redirect:${to}`);
  }
}
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Redirected(to);
  },
}));
vi.mock("@/features/auth", () => ({ SignInPanel: () => null }));

const { default: LoginPage } = await import("./page");

const target = async () => {
  try {
    await LoginPage();
  } catch (error) {
    if (error instanceof Redirected) return error.to;
    throw error;
  }
  return null;
};

describe("login page", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("shows the sign-in panel to a visitor", async () => {
    guards.getSession.mockResolvedValue(null);

    expect(await target()).toBeNull();
  });

  it.each([
    ["attendee", "/dashboard"],
    ["staff", "/staff"],
    ["admin", "/admin"],
    [null, "/onboarding"],
  ] as const)("sends a signed-in %s straight to %s", async (role, path) => {
    guards.getSession.mockResolvedValue({ uid: "u1", role, displayName: null, photoUrl: null });

    expect(await target()).toBe(path);
  });
});
