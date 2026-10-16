import { copy } from "@/shared/copy/es";
import { Icon, PixelPlanet, type IconName, type PlanetKind } from "@/shared/ui";
import type { MissionType } from "../domain/mission";

/** The line icon of each kind of mission. */
export const MISSION_TYPE_ICON: Record<MissionType, IconName> = { talk: "qr", stand: "map-pin", speaker: "person", quiz: "question", keyword: "key" };

export interface MissionTagsProps {
  type: MissionType;
  /** The mission's quadrant, when the edition's plan has it. */
  quadrant?: { name: string; planet: PlanetKind } | null;
  /** True when the mission offers a mini-game the edition has on (winning doubles its XP). */
  minigame?: boolean;
}

const chip = "type-caption border-border bg-bg-deep/60 text-muted-foreground gap-space-1 px-space-2 inline-flex h-7 items-center rounded-sm border";

/** What kind of mission it is, where it is and whether it offers a mini-game, as small chips. */
export function MissionTags({ type, quadrant, minigame }: MissionTagsProps) {
  return (
    <ul aria-label={copy.missions.tags.label} className="gap-space-2 flex flex-wrap">
      <li className={chip}>
        <Icon name={MISSION_TYPE_ICON[type]} size={14} />
        {copy.missions.types[type]}
      </li>
      {quadrant ? (
        <li className={chip}>
          <PixelPlanet kind={quadrant.planet} scale={1} />
          {quadrant.name}
        </li>
      ) : null}
      {minigame ? (
        <li className={`${chip} border-gold/60 text-gold`}>
          <span className="type-pixel-tag text-[12px] leading-4">{copy.missions.tags.minigameBonus}</span>
          {copy.missions.tags.minigame}
        </li>
      ) : null}
    </ul>
  );
}
