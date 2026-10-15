/**
 * One structured line for an unexpected server-side failure (bad credentials, network, permissions).
 * Expected outcomes, such as an expired token, must not be logged here. It keeps only the SDK error
 * code and the first line of the message, so it never prints tokens, cookies or secrets.
 */
export function logServerError(scope: string, cause: unknown): void {
  const code =
    typeof cause === "object" && cause !== null && "code" in cause
      ? String((cause as { code: unknown }).code)
      : undefined;
  const raw = cause instanceof Error ? cause.message : String(cause);
  const message = raw.split("\n")[0].slice(0, 300);

  console.error(JSON.stringify({ type: "server_error", scope, code, message }));
}
