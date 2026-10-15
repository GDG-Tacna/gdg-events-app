/** Modules of white border around a QR code. Scanners need it; 4 is the standard. */
const QUIET_ZONE = 4;

/** One path for the whole code: a horizontal run of dark modules is one rectangle. */
function pathFor(cells: readonly string[]): string {
  const parts: string[] = [];
  cells.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      if (row[x] !== "1") {
        x += 1;
        continue;
      }
      let end = x;
      while (end < row.length && row[end] === "1") end += 1;
      parts.push(`M${x + QUIET_ZONE} ${y + QUIET_ZONE}h${end - x}v1h-${end - x}z`);
      x = end;
    }
  });
  return parts.join("");
}

export interface QrCodeSvgProps {
  /** Rows of "1" (dark) and "0" (light), without the quiet zone. */
  cells: readonly string[];
  /** Accessible name. */
  label: string;
  className?: string;
}

/**
 * Draws a QR code as SVG from its module matrix (nothing is injected as HTML). It is always dark on
 * white with the quiet zone, whatever the theme: scanners read contrast, not our palette.
 */
export function QrCodeSvg({ cells, label, className }: QrCodeSvgProps) {
  const size = cells.length + QUIET_ZONE * 2;

  return (
    <svg
      role="img"
      aria-label={label}
      viewBox={`0 0 ${size} ${size}`}
      shapeRendering="crispEdges"
      className={className}
    >
      <rect width={size} height={size} fill="#ffffff" />
      <path d={pathFor(cells)} fill="#050816" />
    </svg>
  );
}
