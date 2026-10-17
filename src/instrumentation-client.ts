import * as Sentry from "@sentry/nextjs";
import { sentryOptions } from "@/shared/config/sentry";

// Browser errors (screens, the scanner, the stage) go to Sentry; route changes are traced with the same sampling.
Sentry.init(sentryOptions());

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
