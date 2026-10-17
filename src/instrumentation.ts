import * as Sentry from "@sentry/nextjs";

/** Starts Sentry in the runtime this server instance runs: Node for pages and actions, edge for the proxy. */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") await import("./sentry.server.config");
  if (process.env.NEXT_RUNTIME === "edge") await import("./sentry.edge.config");
}

/** Errors thrown while rendering a page or running an action, reported with the route that failed. */
export const onRequestError = Sentry.captureRequestError;
