import { err, ok, type Result } from "@/shared/lib/result";
import { authError, type AuthError, type AuthErrorCode } from "../domain/auth-error";
import type { SessionGateway } from "../domain/ports";

const SESSION_ENDPOINT = "/api/auth/session";
const KNOWN_CODES: readonly AuthErrorCode[] = [
  "cancelled",
  "network",
  "invalid-credential",
  "recent-sign-in-required",
  "unauthenticated",
  "forbidden",
  "unknown",
];

async function readError(response: Response): Promise<AuthError> {
  try {
    const body: unknown = await response.json();
    const code = (body as { error?: unknown }).error;
    if (typeof code === "string" && (KNOWN_CODES as readonly string[]).includes(code)) {
      return authError(code as AuthErrorCode);
    }
  } catch {
    // Non-JSON error body: fall through.
  }
  return authError("unknown");
}

/** Talks to the session route handler; the cookie itself is HTTP-only and set by the server. */
export class HttpSessionGateway implements SessionGateway {
  async open(credential: string): Promise<Result<void, AuthError>> {
    try {
      const response = await fetch(SESSION_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credential }),
      });
      return response.ok ? ok(undefined) : err(await readError(response));
    } catch {
      return err(authError("network"));
    }
  }

  async refresh(credential: string): Promise<Result<void, AuthError>> {
    try {
      const response = await fetch(SESSION_ENDPOINT, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credential }),
      });
      return response.ok ? ok(undefined) : err(await readError(response));
    } catch {
      return err(authError("network"));
    }
  }

  async close(): Promise<Result<void, AuthError>> {
    try {
      const response = await fetch(SESSION_ENDPOINT, { method: "DELETE" });
      return response.ok ? ok(undefined) : err(await readError(response));
    } catch {
      return err(authError("network"));
    }
  }
}
