import { cn } from "@/shared/lib/utils";

export interface RankChipProps {
  /** Numeric level, shown in the pixel font as "NV 3". */
  level: number;
  /** Rank name, already in the user's language. */
  name: string;
  className?: string;
}

/** Rank chip: the level in the pixel font (a game detail) and the name in the body font. */
export function RankChip({ level, name, className }: RankChipProps) {
  return (
    <span
      className={cn(
        "bg-secondary border-input inline-flex items-center gap-space-2 rounded-pill border px-space-3 py-space-1",
        className,
      )}
    >
      <span className="type-pixel-tag text-primary">NV {level}</span>
      <span className="type-label text-foreground">{name}</span>
    </span>
  );
}
