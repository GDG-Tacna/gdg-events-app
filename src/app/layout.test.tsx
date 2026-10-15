import { isValidElement, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/font/google", () => {
  const font = () => ({ variable: "font-var" });
  return { Inter: font, Space_Grotesk: font, Tiny5: font };
});
vi.mock("./globals.css", () => ({}));

const { PwaChrome } = await import("@/app-shell/PwaChrome");
const { PwaProvider } = await import("@/app-shell/providers/pwa-provider");
const { AuthProvider } = await import("@/app-shell/providers/auth-provider");
const { ThemeProvider } = await import("@/app-shell/providers/theme-provider");
const { default: RootLayout, metadata, viewport } = await import("./layout");

/** The chain of component types from the root to the first element of `target`, or null. */
function pathTo(node: ReactNode, target: unknown, trail: unknown[] = []): unknown[] | null {
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = pathTo(child, target, trail);
      if (found) return found;
    }
    return null;
  }
  if (!isValidElement(node)) return null;
  const element = node as { type: unknown; props: { children?: ReactNode } };
  const next = [...trail, element.type];
  if (element.type === target) return next;
  return pathTo(element.props.children, target, next);
}

const tree = RootLayout({ children: <p>página</p> } as never);

describe("root layout", () => {
  it("wraps every page in the theme, auth and PWA providers, in that order", () => {
    const chain = pathTo(tree, PwaProvider) ?? [];

    expect(chain.indexOf(ThemeProvider)).toBeGreaterThan(-1);
    expect(chain.indexOf(ThemeProvider)).toBeLessThan(chain.indexOf(AuthProvider));
    expect(chain.indexOf(AuthProvider)).toBeLessThan(chain.indexOf(PwaProvider));
  });

  it("puts the PWA notices inside the PWA provider, which they need to read from", () => {
    const chain = pathTo(tree, PwaChrome) ?? [];

    expect(chain).toContain(PwaProvider);
    expect(chain.indexOf(PwaProvider)).toBeLessThan(chain.indexOf(PwaChrome));
  });

  it("still renders the page it was given", () => {
    expect(pathTo(tree, "p")).not.toBeNull();
  });

  it("declares the document in Spanish", () => {
    expect((tree as { props: { lang: string } }).props.lang).toBe("es");
  });

  it("matches the manifest: same theme color for the status bar, and safe-area aware", () => {
    expect(viewport.themeColor).toBe("#0a0f24");
    expect(viewport.viewportFit).toBe("cover");
    expect(metadata.title).toBeTruthy();
  });
});
