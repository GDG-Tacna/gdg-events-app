import { configureAxe } from "vitest-axe";

/**
 * jsdom has no layout engine, so axe cannot compute color contrast here.
 * Contrast is verified separately against the palette (WCAG script run by design-wizard).
 */
export const axe = configureAxe({ rules: { "color-contrast": { enabled: false } } });
