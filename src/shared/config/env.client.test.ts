import { afterEach, describe, expect, it, vi } from "vitest";

const PUBLIC_CONFIG = {
  NEXT_PUBLIC_FIREBASE_API_KEY: "key",
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: "demo.firebaseapp.com",
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: "demo",
  NEXT_PUBLIC_FIREBASE_APP_ID: "1:2:web:3",
};

/** A fresh module each time: the parsed env is cached on first use. */
async function loadEnv(vars: Record<string, string | undefined>) {
  vi.resetModules();
  for (const [name, value] of Object.entries({ ...PUBLIC_CONFIG, ...vars })) vi.stubEnv(name, value);
  return (await import("./env.client")).getClientEnv;
}

describe("getClientEnv", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("accepts the web config with the default emulator addresses", async () => {
    const getClientEnv = await loadEnv({ NEXT_PUBLIC_USE_FIREBASE_EMULATOR: undefined, NEXT_PUBLIC_FIRESTORE_EMULATOR_HOST: undefined });

    expect(getClientEnv()).toMatchObject({ projectId: "demo", useEmulator: false, firestoreEmulatorHost: "127.0.0.1:8080" });
  });

  it("accepts a configured Firestore emulator host and port", async () => {
    const getClientEnv = await loadEnv({ NEXT_PUBLIC_USE_FIREBASE_EMULATOR: "true", NEXT_PUBLIC_FIRESTORE_EMULATOR_HOST: "localhost:8181" });

    expect(getClientEnv()).toMatchObject({ useEmulator: true, firestoreEmulatorHost: "localhost:8181" });
  });

  it("refuses an emulator host without a numeric port", async () => {
    for (const host of ["localhost", "localhost:", "localhost:dd", "localhost:80a"]) {
      const getClientEnv = await loadEnv({ NEXT_PUBLIC_FIRESTORE_EMULATOR_HOST: host });
      expect(() => getClientEnv()).toThrow();
    }
  });
});
