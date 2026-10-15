import { cn } from "@/shared/lib/utils";
import { SquadArt } from "@/shared/ui";
import type { Squad } from "../domain/squad";

export interface SquadBadgeProps {
  /** The squad as the catalog describes it. */
  squad: Pick<Squad, "name" | "sprite" | "logo">;
  className?: string;
}

/** Small chip with the squad logo and name. The logo is decorative: the name carries the meaning. */
export function SquadBadge({ squad, className }: SquadBadgeProps) {
  return (
    <span
      className={cn(
        "bg-secondary border-input text-foreground type-caption inline-flex items-center gap-space-2",
        "rounded-pill border px-space-3 py-space-1",
        className,
      )}
    >
      <SquadArt sprite={squad.sprite} logoUrl={squad.logo?.url} scale={1} />
      {squad.name}
    </span>
  );
}
