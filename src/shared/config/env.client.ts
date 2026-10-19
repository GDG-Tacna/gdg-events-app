import { z } from "zod";

const clientEnvSchema = z.object({
  apiKey: z.string().min(1),
  authDomain: z.string().min(1),
  projectId: z.string().min(1),
  appId: z.string().min(1),
  /** Google Analytics (GA4) web stream id. Optional: without it nothing is measured. */
  measurementId: z.string().regex(/^G-[A-Z0-9]+$/).optional(),
  useEmulator: z.boolean(),
  authEmulatorUrl: z.string().min(1),
  /** Host and port of the Firestore emulator, for the stage screen's listeners (phase 6). */
  firestoreEmulatorHost: z.string().regex(/^[^:]+:\d+$/),
});

export type ClientEnv = z.infer<typeof clientEnvSchema>;

let cached: ClientEnv | undefined;

/**
 * Public Firebase web config. Each variable is read as a literal
 * `process.env.NEXT_PUBLIC_*` so Next.js can inline it into the client bundle.
 * Parsed lazily so a missing value fails at first use, not at build time.
 */
export function getClientEnv(): ClientEnv {
  cached ??= clientEnvSchema.parse({
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
    measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID || undefined,
    useEmulator: process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR === "true",
    authEmulatorUrl:
      process.env.NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_URL ?? "http://127.0.0.1:9099",
    firestoreEmulatorHost: process.env.NEXT_PUBLIC_FIRESTORE_EMULATOR_HOST ?? "127.0.0.1:8080",
  });
  return cached;
}
