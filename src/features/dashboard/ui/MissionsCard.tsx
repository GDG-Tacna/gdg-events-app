import { copy } from "@/shared/copy/es";
import { formatNumber, interpolate } from "@/shared/lib/format";
import { TerminalCard } from "@/shared/ui";

export interface MissionsCardProps {
  href: string;
  /** XP the edition's open missions give in all. */
  xp: number;
  /** The quadrants that have open missions, in order. */
  quadrants: readonly string[];
}

/** Joins names as "A, B y C". */
const listOf = (names: readonly string[]) => (names.length <= 1 ? names.join("") : `${names.slice(0, -1).join(", ")} y ${names[names.length - 1]}`);

/** The gold entry of the terminal: the missions on offer, the XP they give in all and where they are. */
export function MissionsCard({ href, xp, quadrants }: MissionsCardProps) {
  const t = copy.dashboard.missionsCard;
  return (
    <TerminalCard
      icon="target"
      tone="gold"
      title={t.title}
      tag={xp > 0 ? interpolate(t.xp, { n: formatNumber(xp) }) : undefined}
      body={quadrants.length > 0 ? interpolate(t.body, { list: listOf(quadrants) }) : t.empty}
      action={{ href, label: t.open, kind: "chevron" }}
    />
  );
}
