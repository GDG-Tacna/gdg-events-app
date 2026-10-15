import "server-only";

// Public API (server-only): what the `/sw.js` route needs to build the worker.
export {
  IMMUTABLE_PREFIXES,
  OFFLINE_PATH,
  serviceWorkerSource,
  type ServiceWorkerOptions,
} from "./data/service-worker-source";
