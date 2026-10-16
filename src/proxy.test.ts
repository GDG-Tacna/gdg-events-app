import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { SESSION_COOKIE_NAME } from "@/features/auth/constants";
import { config, proxy } from "./proxy";

const request = (path: string, withCookie = false) =>
  new NextRequest(`http://localhost${path}`, {
    headers: withCookie ? { cookie: `${SESSION_COOKIE_NAME}=anything` } : {},
  });

const redirectTarget = (response: Response) => response.headers.get("location");

describe("proxy", () => {
  it.each(["/dashboard", "/dashboard/anything", "/onboarding", "/squad", "/scan", "/pass", "/map", "/missions", "/odyssey", "/achievements", "/minigame/ai-quiz", "/red", "/escenario", "/staff", "/staff/scan", "/admin", "/speaker", "/encuesta", "/avatar"])(
    "sends %s to /login when there is no session cookie",
    (path) => {
      const response = proxy(request(path));

      expect(response.status).toBe(307);
      expect(redirectTarget(response)).toBe("http://localhost/login");
    },
  );

  it("lets a protected route through when the cookie exists (real verification happens server-side)", () => {
    const response = proxy(request("/dashboard", true));

    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it.each(["/login", "/", "/offline", "/dashboards-info", "/administrator", "/invite/speaker/devfest-2026.abc", "/speakers-info"])(
    "does not protect %s",
    (path) => {
      expect(redirectTarget(proxy(request(path)))).toBeNull();
    },
  );

  it("never bounces a signed-in user away from /login (a stale cookie would loop)", () => {
    expect(redirectTarget(proxy(request("/login", true)))).toBeNull();
  });
});

describe("proxy matcher", () => {
  const [pattern] = config.matcher;
  const regex = new RegExp(`^${pattern}$`);

  it.each(["/dashboard", "/login", "/staff/scan"])("runs on %s", (path) => {
    expect(regex.test(path)).toBe(true);
  });

  it.each(["/api/auth/session", "/_next/static/chunk.js", "/favicon.ico", "/manifest.webmanifest", "/logo.png"])(
    "skips %s",
    (path) => {
      expect(regex.test(path)).toBe(false);
    },
  );
});
