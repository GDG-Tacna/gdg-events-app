import * as Sentry from "@sentry/nextjs";
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import { logServerError } from "./log";

describe("logServerError", () => {
  let spy: MockInstance<typeof console.error>;

  beforeEach(() => {
    vi.mocked(Sentry.captureException).mockClear();
    spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
  });
  afterEach(() => {
    spy.mockRestore();
  });

  const lastLine = () => JSON.parse(spy.mock.calls[0][0] as string) as Record<string, unknown>;

  it("writes one structured line with the scope, the SDK error code and the message", () => {
    logServerError("auth.session.create", Object.assign(new Error("Could not load the default credentials"), { code: "app/invalid-credential" }));

    expect(spy).toHaveBeenCalledOnce();
    expect(lastLine()).toEqual({
      type: "server_error",
      scope: "auth.session.create",
      code: "app/invalid-credential",
      message: "Could not load the default credentials",
    });
  });

  it("keeps only the first line of the message, so stack traces and payloads are not printed", () => {
    logServerError("x", new Error("first line\nsecond line with a secret-token-123"));

    expect(lastLine().message).toBe("first line");
    expect(JSON.stringify(lastLine())).not.toContain("secret-token-123");
  });

  it("truncates very long messages", () => {
    logServerError("x", new Error("a".repeat(1000)));

    expect((lastLine().message as string).length).toBe(300);
  });

  it("reports to Sentry with the scope and code as tags, never the rest of the message, keeping the stack frames", () => {
    const cause = Object.assign(new TypeError("first line\nsecond line with a secret-token-123"), { code: "permission-denied" });

    logServerError("polls.store.cast", cause);

    const [reported, context] = vi.mocked(Sentry.captureException).mock.calls[0] as [Error, { tags: Record<string, string> }];
    expect(context.tags).toEqual({ scope: "polls.store.cast", code: "permission-denied" });
    expect(reported).toBeInstanceOf(Error);
    expect(reported.name).toBe("TypeError");
    expect(reported.message).toBe("first line");
    expect(reported.stack).not.toContain("secret-token-123");
    expect(reported.stack).toMatch(/\n\s+at /);
  });

  it("copes with values that are not errors", () => {
    logServerError("x", "plain string");
    expect(lastLine()).toMatchObject({ message: "plain string" });
    expect(lastLine().code).toBeUndefined();
  });
});
