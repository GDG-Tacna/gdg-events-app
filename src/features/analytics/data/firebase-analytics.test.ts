// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

const firebaseAnalytics = vi.hoisted(() => ({
  isSupported: vi.fn(async () => true),
  initializeAnalytics: vi.fn(() => ({ marker: "analytics" })),
  logEvent: vi.fn(),
}));
vi.mock("firebase/analytics", () => firebaseAnalytics);
vi.mock("@/shared/lib/firebase/client", () => ({ getFirebaseApp: () => ({ marker: "app" }) }));

const PUBLIC_CONFIG = {
  NEXT_PUBLIC_FIREBASE_API_KEY: "key",
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: "demo.firebaseapp.com",
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: "demo",
  NEXT_PUBLIC_FIREBASE_APP_ID: "1:2:web:3",
};

/** A fresh module each time: Analytics is loaded once per page. */
async function loadModule(vars: Record<string, string | undefined>) {
  vi.resetModules();
  for (const [name, value] of Object.entries({ ...PUBLIC_CONFIG, ...vars })) vi.stubEnv(name, value);
  return import("./firebase-analytics");
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 50));

describe("analytics", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it("records an event in production, with Google signals and ad personalization off", async () => {
    const { firebaseAnalyticsSink: track } = await loadModule({ NODE_ENV: "production", NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID: "G-AB12CD34" });

    track({ name: "check_in", params: { kind: "talk" } });
    track({ name: "contact_made" });
    await vi.waitFor(() => expect(firebaseAnalytics.logEvent).toHaveBeenCalledTimes(2));

    expect(firebaseAnalytics.initializeAnalytics).toHaveBeenCalledOnce();
    expect(firebaseAnalytics.initializeAnalytics).toHaveBeenCalledWith({ marker: "app" }, { config: { allow_google_signals: false, allow_ad_personalization_signals: false } });
    expect(firebaseAnalytics.logEvent).toHaveBeenCalledWith({ marker: "analytics" }, "check_in", { kind: "talk" });
    expect(firebaseAnalytics.logEvent).toHaveBeenCalledWith({ marker: "analytics" }, "contact_made", undefined);
  });

  it.each([
    ["outside production", { NODE_ENV: "test", NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID: "G-AB12CD34" }],
    ["without a measurement id", { NODE_ENV: "production", NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID: undefined }],
    ["against the emulators", { NODE_ENV: "production", NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID: "G-AB12CD34", NEXT_PUBLIC_USE_FIREBASE_EMULATOR: "true" }],
  ])("measures nothing %s", async (_label, vars) => {
    const { firebaseAnalyticsSink: track } = await loadModule(vars);

    track({ name: "poll_vote" });
    await settle();

    expect(firebaseAnalytics.initializeAnalytics).not.toHaveBeenCalled();
    expect(firebaseAnalytics.logEvent).not.toHaveBeenCalled();
  });

  it("measures nothing, and never throws, where the browser does not support it", async () => {
    firebaseAnalytics.isSupported.mockResolvedValueOnce(false);
    const { startFirebaseAnalytics: startAnalytics, firebaseAnalyticsSink: track } = await loadModule({ NODE_ENV: "production", NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID: "G-AB12CD34" });

    expect(() => startAnalytics()).not.toThrow();
    track({ name: "poll_vote" });
    await settle();

    expect(firebaseAnalytics.logEvent).not.toHaveBeenCalled();
  });
});
