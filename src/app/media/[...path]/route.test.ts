import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/shared/lib/firebase/admin", () => ({ getAdminFirestore: vi.fn() }));
const reader = vi.hoisted(() => ({ store: { get: vi.fn() } }));
vi.mock("@/app-shell/composition/media.server", () => ({ imageReader: reader }));

const { GET } = await import("./route");

const PATH = "public/devfest-2026/squad-logo/0f8e2c1a-1111-4222-8333-944455551111.svg";
const request = (path: string) => GET(new Request(`http://localhost/media/${path}`), { params: Promise.resolve({ path: path.split("/") }) });

describe("GET /media/[...path]", () => {
  beforeEach(() => reader.store.get.mockReset());

  it("serves an app image with its type, a lasting cache and headers that keep it inert", async () => {
    reader.store.get.mockResolvedValue({ ok: true, value: { bytes: new TextEncoder().encode("<svg/>"), contentType: "image/svg+xml" } });

    const response = await request(PATH);

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("<svg/>");
    expect(response.headers.get("Content-Type")).toBe("image/svg+xml");
    expect(response.headers.get("Cache-Control")).toBe("public, max-age=31536000, immutable");
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(response.headers.get("Content-Security-Policy")).toContain("sandbox");
    expect(reader.store.get).toHaveBeenCalledWith(PATH);
  });

  it("answers 404 for a missing image and for any path that is not an app image, without reading it", async () => {
    reader.store.get.mockResolvedValue({ ok: true, value: null });
    expect((await request(PATH)).status).toBe(404);

    expect((await request("public/devfest-2026/badge/../../secrets.webp")).status).toBe(404);
    expect((await request("private/x.webp")).status).toBe(404);
    expect(reader.store.get).toHaveBeenCalledTimes(1);
  });

  it("answers 503, never cached, when the read fails", async () => {
    reader.store.get.mockResolvedValue({ ok: false, error: { code: "unknown" } });

    const response = await request(PATH);

    expect(response.status).toBe(503);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });
});
