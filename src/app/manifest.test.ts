import { describe, expect, it } from "vitest";
import { copy } from "@/shared/copy/es";
import manifest from "./manifest";

const m = manifest();

describe("web app manifest", () => {
  it("names the app with the Design System brand and a short name that fits under the icon", () => {
    expect(m.name).toBe(copy.brand.name);
    expect(m.short_name).toBe(copy.brand.shortName);
    expect((m.short_name ?? "").length).toBeLessThanOrEqual(12);
    expect(m.description).toBe(copy.brand.description);
  });

  it("opens as an installed app, on the whole site, in Spanish and in portrait", () => {
    expect(m).toMatchObject({ display: "standalone", scope: "/", start_url: "/", id: "/", lang: "es", orientation: "portrait" });
  });

  it("starts inside its own scope", () => {
    expect(m.start_url?.startsWith(m.scope ?? "/")).toBe(true);
  });

  it("uses the dark Design System background for the splash and the status bar", () => {
    expect(m.background_color).toBe("#0a0f24");
    expect(m.theme_color).toBe("#0a0f24");
  });

  it("declares the icons browsers require for installing: 192 and 512 as 'any', and a maskable 512", () => {
    const icons = m.icons ?? [];
    const has = (sizes: string, purpose: string) => icons.some((icon) => icon.sizes === sizes && icon.purpose === purpose);

    expect(has("192x192", "any")).toBe(true);
    expect(has("512x512", "any")).toBe(true);
    expect(has("512x512", "maskable")).toBe(true);
  });

  it("serves every icon as a PNG from /icons, the folder the service worker caches forever", () => {
    for (const icon of m.icons ?? []) {
      expect(icon.type).toBe("image/png");
      expect(icon.src.startsWith("/icons/")).toBe(true);
      expect(icon.src.endsWith(".png")).toBe(true);
    }
  });

  it("does not use the same file for 'any' and 'maskable' (a maskable icon needs its own safe zone)", () => {
    const icons = m.icons ?? [];
    const any = new Set(icons.filter((icon) => icon.purpose === "any").map((icon) => icon.src));
    const maskable = icons.filter((icon) => icon.purpose === "maskable").map((icon) => icon.src);

    for (const src of maskable) expect(any.has(src)).toBe(false);
  });
});
