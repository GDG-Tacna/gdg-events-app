import * as Sentry from "@sentry/nextjs";
import { sentryOptions } from "@/shared/config/sentry";

Sentry.init({
  ...sentryOptions(),
  // Vercel's Node runtime cannot load the ES module hooks that instrument dependencies at load time (they failed with
  // "Unexpected token 'export'" on every cold start). Errors are reported without them; only per-library spans go.
  enableRuntimeChannelInjection: false,
});
