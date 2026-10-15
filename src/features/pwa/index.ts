// Public API (client-safe).
export type { Connectivity, PlatformInfo, PwaError, PwaErrorCode, ServiceWorkerHost } from "./domain/ports";
export { initialPwaState, pwaReducer, type PwaEvent, type PwaState, type UpdateStatus } from "./domain/pwa-state";
export { applyUpdate, startPwa, type PwaSession } from "./domain/use-cases";
export { BrowserConnectivity } from "./data/browser-connectivity";
export { BrowserPlatform } from "./data/browser-platform";
export { BrowserServiceWorkerHost } from "./data/browser-service-worker-host";
export { PwaProvider, usePwa, type PwaContextValue, type PwaProviderProps } from "./ui/pwa-context";
export { InstallHint } from "./ui/InstallHint";
export { OfflineBanner } from "./ui/OfflineBanner";
export { UpdatePrompt } from "./ui/UpdatePrompt";
