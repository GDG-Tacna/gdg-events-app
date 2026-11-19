"use client";

import { useTheme } from "next-themes";
import { useSyncExternalStore } from "react";
import { copy } from "@/shared/copy/es";
import { Icon } from "./Icon";

/**
 * Switches between the light and dark themes, like the DevFest Tacna site. Until the person picks one, the theme
 * follows the system. Before mounting the resolved theme is unknown, so the icon stays hidden to avoid a mismatch.
 */
const noop = () => () => {};

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(noop, () => true, () => false);

  // The server does not know the resolved theme, so the label settles after mounting (no hydration mismatch).
  const dark = mounted && resolvedTheme === "dark";
  const label = dark ? copy.common.theme.toLight : copy.common.theme.toDark;

  return (
    <button
      type="button"
      onClick={() => setTheme(dark ? "light" : "dark")}
      aria-label={label}
      title={label}
      // Round ink-bordered button, like the site's theme toggle; hover turns pastel yellow with coal text.
      className="border-ink text-foreground hover:bg-pastel-yellow hover:text-on-accent focus-visible:ring-ring inline-grid size-12 shrink-0 place-items-center rounded-full border-2 bg-transparent transition-colors focus-visible:ring-[3px] focus-visible:outline-none"
    >
      {mounted ? <Icon name={dark ? "sun" : "moon"} size={22} /> : null}
    </button>
  );
}
