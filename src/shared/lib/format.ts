const NUMBER_FORMAT = new Intl.NumberFormat("es-PE");

/** Whole numbers with the Spanish thousands separator ("1 250"). One locale on server and client, so renders match. */
export function formatNumber(value: number): string {
  return NUMBER_FORMAT.format(Number.isFinite(value) ? Math.trunc(value) : 0);
}

/**
 * Fills `{name}` placeholders of a copy template ("{xp} / {next} XP"). Placeholders without a value
 * are left as they are, so a missing value is visible in review instead of printing "undefined".
 */
export function interpolate(template: string, values: Readonly<Record<string, string>>): string {
  return template.replace(/\{(\w+)\}/g, (placeholder, key: string) => values[key] ?? placeholder);
}
