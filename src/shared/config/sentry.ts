/**
 * What every Sentry runtime (browser, Node server, edge proxy) shares. Monitoring is on only in production builds that
 * have a DSN, so local development and tests never send anything. Privacy first: no personal data (emails, aliases,
 * IPs, cookies) and no session replay; a tenth of the requests are traced so a 300-person event fits the quota.
 */
export function sentryOptions() {
  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN || undefined;
  return {
    dsn,
    enabled: process.env.NODE_ENV === "production" && dsn !== undefined,
    environment: process.env.NEXT_PUBLIC_VERCEL_ENV || process.env.NODE_ENV,
    sendDefaultPii: false,
    tracesSampleRate: 0.1,
  };
}
