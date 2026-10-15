import "server-only";
import { z } from "zod";

const serverEnvSchema = z.object({
  projectId: z.string().min(1),
  /** Service account JSON (one line). Optional: emulators and ADC do not need it. */
  serviceAccountKey: z.string().min(1).optional(),
  /** Set by the Firebase tooling or by us when running against the Auth emulator. */
  authEmulatorHost: z.string().min(1).optional(),
  /** Set by the Firebase tooling when running against the Firestore emulator. */
  firestoreEmulatorHost: z.string().min(1).optional(),
  /**
   * Secret that signs the ephemeral QR codes. Optional here on purpose: its length is checked where it
   * is used, so a missing or short one stops QR codes with a clear log line instead of breaking sign-in.
   */
  qrSigningSecret: z.string().optional(),
  /** The app's public address (https://…), for links in emails. Optional: without it no email is sent. */
  // A malformed one is ignored (no emails) instead of breaking every server request.
  appUrl: z.string().url().optional().catch(undefined),
  /** Resend: the API key and a sender of a verified domain ("Equipo <equipo@dominio.com>"). Both, or no emails. */
  resendApiKey: z.string().min(1).optional(),
  inviteFrom: z.string().min(3).optional(),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

let cached: ServerEnv | undefined;

/** Server-only configuration. Never import from client code (guarded by `server-only`). */
export function getServerEnv(): ServerEnv {
  cached ??= serverEnvSchema.parse({
    projectId: process.env.FIREBASE_PROJECT_ID ?? process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    serviceAccountKey: process.env.FIREBASE_SERVICE_ACCOUNT_KEY || undefined,
    authEmulatorHost: process.env.FIREBASE_AUTH_EMULATOR_HOST || undefined,
    firestoreEmulatorHost: process.env.FIRESTORE_EMULATOR_HOST || undefined,
    qrSigningSecret: process.env.QR_SIGNING_SECRET || undefined,
    appUrl: process.env.APP_URL?.replace(/\/+$/, "") || undefined,
    resendApiKey: process.env.RESEND_API_KEY || undefined,
    inviteFrom: process.env.INVITE_FROM || undefined,
  });
  return cached;
}
