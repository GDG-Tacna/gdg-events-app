export interface PixelSpriteProps {
  /** One string per row; each character is a palette key, "." is transparent. */
  rows: readonly string[];
  palette: Readonly<Record<string, string>>;
  /** Integer scale (1 pixel of art = `scale` screen pixels) so edges stay crisp. */
  scale?: number;
  /** Accessible name. Without it the sprite is decorative. */
  title?: string;
  className?: string;
}

interface Run {
  x: number;
  y: number;
  length: number;
  key: string;
}

/** Collapses horizontal runs of the same color into one rect to keep the SVG small. */
function toRuns(rows: readonly string[]): Run[] {
  const runs: Run[] = [];
  rows.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      const key = row[x];
      let end = x;
      while (end + 1 < row.length && row[end + 1] === key) end += 1;
      if (key !== ".") runs.push({ x, y, length: end - x + 1, key });
      x = end + 1;
    }
  });
  return runs;
}

export function PixelSprite({ rows, palette, scale = 3, title, className }: PixelSpriteProps) {
  const height = rows.length;
  const width = Math.max(...rows.map((row) => row.length));
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={width * scale}
      height={height * scale}
      shapeRendering="crispEdges"
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      focusable="false"
      className={className}
    >
      {toRuns(rows).map((run) => (
        <rect
          key={`${run.y}-${run.x}`}
          x={run.x}
          y={run.y}
          width={run.length}
          height={1}
          fill={palette[run.key]}
        />
      ))}
    </svg>
  );
}
