import type { Connectivity } from "../domain/ports";

/** `navigator.onLine` plus the browser's online and offline events. */
export class BrowserConnectivity implements Connectivity {
  isOnline(): boolean {
    return typeof navigator === "undefined" ? true : navigator.onLine;
  }

  subscribe(listener: () => void): () => void {
    window.addEventListener("online", listener);
    window.addEventListener("offline", listener);
    return () => {
      window.removeEventListener("online", listener);
      window.removeEventListener("offline", listener);
    };
  }
}
