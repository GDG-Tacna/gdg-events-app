import type { PlatformInfo } from "../domain/ports";

/** Facts about how the app runs, read from the browser. */
export class BrowserPlatform implements PlatformInfo {
  isStandalone(): boolean {
    if (typeof window === "undefined") return false;
    // `navigator.standalone` is the iOS Safari flag; the media query covers every other browser.
    const iosStandalone = (navigator as Navigator & { standalone?: boolean }).standalone === true;
    return iosStandalone || window.matchMedia("(display-mode: standalone)").matches;
  }

  isIosSafari(): boolean {
    if (typeof navigator === "undefined") return false;
    const ua = navigator.userAgent;
    // iPadOS 13+ reports a desktop user agent, so it is recognized by touch support on a Mac platform.
    const isIos = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    // Other iOS browsers (Chrome, Firefox, Edge) cannot install either, but only Safari shows the share sheet hint.
    const isOtherBrowser = /CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);
    return isIos && !isOtherBrowser;
  }
}
