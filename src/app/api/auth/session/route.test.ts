import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/app-shell/composition/auth.server", () => ({ authDeps: { sessions: {} } }));

const server = {
  openSession: vi.fn(),
  closeSession: vi.fn(),
  refreshSessionCookie: vi.fn(),
  readSessionCookie: vi.fn(),
  writeSessionCookie: vi.fn(),
  clearSessionCookie: vi.fn(),
};
vi.mock("@/features/auth/server", () => server);

const { DELETE, POST, PUT } = await import("./route");

const SAME_ORIGIN = { Origin: "http://localhost" };

const post = (body: unknown, headers: Record<string, string> = { ...SAME_ORIGIN, "Content-Type": "application/json" }) =>
  new Request("http://localhost/api/auth/session", {
    method: "POST",
    headers,
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

describe("POST /api/auth/session", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("sets the cookie and answers 200 for a valid credential", async () => {
    const cookie = { value: "cookie", expiresAt: new Date(0) };
    server.openSession.mockResolvedValue({ ok: true, value: cookie });

    const response = await POST(post({ credential: "cred" }));

    expect(response.status).toBe(200);
    expect(server.openSession).toHaveBeenCalledWith(expect.anything(), "cred");
    expect(server.writeSessionCookie).toHaveBeenCalledWith(cookie);
  });

  it.each([
    ["an empty body", {}],
    ["a blank credential", { credential: "" }],
    ["malformed JSON", "{not json"],
  ])("rejects %s with 401 and never opens a session", async (_label, body) => {
    const response = await POST(post(body));

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "invalid-credential" });
    expect(server.openSession).not.toHaveBeenCalled();
    expect(server.writeSessionCookie).not.toHaveBeenCalled();
  });

  it.each([
    ["recent-sign-in-required", 401],
    ["network", 502],
    ["unknown", 500],
  ] as const)("maps the %s failure to HTTP %i without setting a cookie", async (code, status) => {
    server.openSession.mockResolvedValue({ ok: false, error: { code } });

    const response = await POST(post({ credential: "cred" }));

    expect(response.status).toBe(status);
    expect(await response.json()).toEqual({ error: code });
    expect(server.writeSessionCookie).not.toHaveBeenCalled();
  });
});

describe("requests from another site (login CSRF)", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it.each([
    ["another origin", { Origin: "https://evil.example", "Content-Type": "application/json" }],
    ["no origin", { "Content-Type": "application/json" }],
    ["a form body", { ...SAME_ORIGIN, "Content-Type": "text/plain" }],
  ])("refuses to open a session from %s", async (_label, headers) => {
    const response = await POST(post({ credential: "cred" }, headers));

    expect(response.status).toBe(403);
    expect(server.openSession).not.toHaveBeenCalled();
    expect(server.writeSessionCookie).not.toHaveBeenCalled();
  });

  it("refuses to refresh or close a session for another origin", async () => {
    const elsewhere = { Origin: "https://evil.example", "Content-Type": "application/json" };

    expect((await PUT(new Request("http://localhost/api/auth/session", { method: "PUT", headers: elsewhere, body: "{}" }))).status).toBe(403);
    expect((await DELETE(new Request("http://localhost/api/auth/session", { method: "DELETE", headers: elsewhere }))).status).toBe(403);
    expect(server.refreshSessionCookie).not.toHaveBeenCalled();
    expect(server.closeSession).not.toHaveBeenCalled();
    expect(server.clearSessionCookie).not.toHaveBeenCalled();
  });
});

describe("PUT /api/auth/session", () => {
  const put = (body: unknown) =>
    new Request("http://localhost/api/auth/session", {
      method: "PUT",
      headers: { ...SAME_ORIGIN, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("replaces the cookie using the current one as proof", async () => {
    const cookie = { value: "cookie-2", expiresAt: new Date(0) };
    server.readSessionCookie.mockResolvedValue("cookie-1");
    server.refreshSessionCookie.mockResolvedValue({ ok: true, value: cookie });

    const response = await PUT(put({ credential: "fresh" }));

    expect(response.status).toBe(200);
    expect(server.refreshSessionCookie).toHaveBeenCalledWith(expect.anything(), "fresh", "cookie-1");
    expect(server.writeSessionCookie).toHaveBeenCalledWith(cookie);
  });

  it("rejects an unauthenticated refresh with 401 and keeps the cookie untouched", async () => {
    server.readSessionCookie.mockResolvedValue(undefined);
    server.refreshSessionCookie.mockResolvedValue({ ok: false, error: { code: "unauthenticated" } });

    const response = await PUT(put({ credential: "fresh" }));

    expect(response.status).toBe(401);
    expect(server.writeSessionCookie).not.toHaveBeenCalled();
  });

  it("rejects a body without a credential", async () => {
    const response = await PUT(put({}));

    expect(response.status).toBe(401);
    expect(server.refreshSessionCookie).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/auth/session", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("revokes the session and clears the cookie", async () => {
    server.readSessionCookie.mockResolvedValue("cookie");
    server.closeSession.mockResolvedValue({ ok: true, value: undefined });

    const response = await DELETE(new Request("http://localhost/api/auth/session", { method: "DELETE", headers: SAME_ORIGIN }));

    expect(response.status).toBe(200);
    expect(server.closeSession).toHaveBeenCalledWith(expect.anything(), "cookie");
    expect(server.clearSessionCookie).toHaveBeenCalledOnce();
  });

  it("clears the cookie even when revocation fails, and reports the failure", async () => {
    server.readSessionCookie.mockResolvedValue("cookie");
    server.closeSession.mockResolvedValue({ ok: false, error: { code: "unknown" } });

    const response = await DELETE(new Request("http://localhost/api/auth/session", { method: "DELETE", headers: SAME_ORIGIN }));

    expect(response.status).toBe(500);
    expect(server.clearSessionCookie).toHaveBeenCalledOnce();
  });
});
