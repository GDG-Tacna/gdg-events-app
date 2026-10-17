import * as Sentry from "@sentry/nextjs";

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
  Sentry.captureException(sanitized(cause, message), { tags: { scope, ...(code ? { code } : {}) } });
}

/**
 * What Sentry receives: the same trimmed first line as the log, never the full message (an SDK error may quote a
 * token or a document), with the original stack frames so the failing line is still found.
 */
function sanitized(cause: unknown, message: string): Error {
  const error = new Error(message);
  if (cause instanceof Error) {
    error.name = cause.name;
    const frames = cause.stack?.split("\n").filter((line) => line.trimStart().startsWith("at ")) ?? [];
    if (frames.length > 0) error.stack = `${error.name}: ${message}\n${frames.join("\n")}`;
  }
  return error;
}
