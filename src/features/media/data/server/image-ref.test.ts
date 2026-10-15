import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/shared/lib/firebase/admin", () => ({ getAdminFirestore: vi.fn() }));

const { imageRefOf } = await import("./image-ref");

const BADGE = "public/devfest-2026/badge/0f8e2c1a-1111-4222-8333-944455556666.webp";

describe("imageRefOf", () => {
  it("rebuilds the public address of an app image of that purpose", () => {
    expect(imageRefOf(BADGE, "badge")).toEqual({
      path: BADGE,
      url: "/media/public/devfest-2026/badge/0f8e2c1a-1111-4222-8333-944455556666.webp",
    });
  });

  it("refuses an image of another purpose and any path that is not an app image", () => {
    expect(imageRefOf(BADGE, "raffle-prize")).toBeNull();
    expect(imageRefOf("https://evil.example/x.webp", "badge")).toBeNull();
    expect(imageRefOf("public/devfest-2026/badge/../../secret.webp", "badge")).toBeNull();
    expect(imageRefOf("", "badge")).toBeNull();
  });
});
