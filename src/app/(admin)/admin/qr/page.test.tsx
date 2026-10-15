import { describe, expect, it, vi } from "vitest";

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

const { default: AdminQrPage } = await import("./page");

describe("admin QR page", () => {
  it("leads to Charlas, where each talk's QR is projected", () => {
    expect(() => AdminQrPage()).toThrow(new Redirected("/admin/charlas"));
  });
});
