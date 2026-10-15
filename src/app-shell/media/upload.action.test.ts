import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/app-shell/composition/media.server", () => ({ mediaDeps: { marker: "media" } }));

const guards = { getSession: vi.fn() };
vi.mock("@/app-shell/guards", () => guards);

const features = { FEATURES: { admin: true } };
vi.mock("@/shared/config/features", () => features);

const server = { storeImage: vi.fn(), IMAGE_PURPOSES: ["badge", "squad-logo"] };
vi.mock("@/features/media/server", () => server);

const { uploadImageAction } = await import("./upload.action");

const IMAGE = { path: "public/e/badge/x1234567.webp", url: "https://cdn/x", width: 10, height: 10, format: "webp" };

function form(purpose: unknown, file: unknown = new Blob([new Uint8Array([1, 2, 3])])) {
  const data = new FormData();
  if (purpose !== undefined) data.set("purpose", purpose as string);
  if (file !== undefined) data.set("file", file as Blob);
  return data;
}

describe("uploadImageAction", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    features.FEATURES.admin = true;
    guards.getSession.mockResolvedValue({ uid: "a1", role: "admin" });
    server.storeImage.mockResolvedValue({ ok: true, value: IMAGE });
  });

  it("stores the file for an admin with the session's identity and answers where it is", async () => {
    expect(await uploadImageAction(form("badge"))).toEqual({ ok: true, image: IMAGE });
    expect(server.storeImage).toHaveBeenCalledWith({ marker: "media" }, { uid: "a1", role: "admin" }, { purpose: "badge", bytes: new Uint8Array([1, 2, 3]) });
  });

  it("refuses with the admin area off, without a session, or for anyone but an admin", async () => {
    features.FEATURES.admin = false;
    expect(await uploadImageAction(form("badge"))).toEqual({ ok: false, code: "disabled" });
    features.FEATURES.admin = true;

    guards.getSession.mockResolvedValue(null);
    expect(await uploadImageAction(form("badge"))).toEqual({ ok: false, code: "unauthenticated" });

    guards.getSession.mockResolvedValue({ uid: "s1", role: "staff" });
    expect(await uploadImageAction(form("badge"))).toEqual({ ok: false, code: "forbidden" });
    expect(server.storeImage).not.toHaveBeenCalled();
  });

  it("refuses an unknown purpose and a missing file before reading anything", async () => {
    expect(await uploadImageAction(form("avatar"))).toEqual({ ok: false, code: "unsupported-format" });
    expect(await uploadImageAction(form(undefined))).toEqual({ ok: false, code: "unsupported-format" });
    expect(await uploadImageAction(form("badge", "not a file"))).toEqual({ ok: false, code: "empty" });
    expect(server.storeImage).not.toHaveBeenCalled();
  });

  it("passes on the use case's refusal", async () => {
    server.storeImage.mockResolvedValue({ ok: false, error: { code: "too-large" } });

    expect(await uploadImageAction(form("badge"))).toEqual({ ok: false, code: "too-large" });
  });
});
