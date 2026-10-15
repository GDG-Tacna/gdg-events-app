import Image from "next/image";
import Link from "next/link";
import { copy } from "@/shared/copy/es";
import { formatNumber, interpolate } from "@/shared/lib/format";
import { cn } from "@/shared/lib/utils";
import { ButtonLink, Card, Icon, PixelPlanet, ProgressBar, type PlanetKind } from "@/shared/ui";
import type { BoardMission, MissionBoard } from "../domain/use-cases";
import { MISSION_TYPE_ICON, MissionTags } from "./MissionTags";

/** A quadrant as the board needs it (the page reads it from the galaxy map). */
export interface BoardQuadrant {
  id: string;
  name: string;
  planet: PlanetKind;
}

export interface MissionBoardViewProps {
  board: MissionBoard;
  /** Active quadrants in order. Missions of a quadrant not listed go to "Otras misiones". */
  quadrants: readonly BoardQuadrant[];
  /** Where a mission opens (its own screen, to answer it or see how to complete it). */
  missionHref: (id: string) => string;
  /** Where the edition's story is read, when it is on. */
  odysseyHref?: string;
  /** The story's title, to name the link; without one it says "Leer la historia". */
  odysseyTitle?: string | null;
  /** The mini-games the edition has on: a mission offering one of them gets the "XP x2" tag. */
  enabledGames?: ReadonlySet<string>;
}

interface Group {
  key: string;
  quadrant: BoardQuadrant | null;
  missions: BoardMission[];
}

function groupByQuadrant(missions: readonly BoardMission[], quadrants: readonly BoardQuadrant[]): Group[] {
  const groups: Group[] = quadrants.map((quadrant) => ({ key: quadrant.id, quadrant, missions: [] }));
  const other: Group = { key: "other", quadrant: null, missions: [] };
  for (const mission of missions) {
    (groups.find((group) => group.key === mission.quadrantId) ?? other).missions.push(mission);
  }
  return [...groups, other].filter((group) => group.missions.length > 0);
}

/**
 * The attendee's missions: overall progress, then the missions grouped by quadrant with their type,
 * XP and status. It only shows; answering and scanning happen in their own screens (module 3).
 */
export function MissionBoardView({ board, quadrants, missionHref, odysseyHref, odysseyTitle, enabledGames }: MissionBoardViewProps) {
  const groups = groupByQuadrant(board.missions, quadrants);

  return (
    <div className="gap-space-6 flex flex-col">
      <header className="gap-space-2 flex flex-col">
        <h1 className="type-title text-foreground">{copy.missions.title}</h1>
        <p className="type-body text-muted-foreground">{copy.missions.subtitle}</p>
        {odysseyHref ? (
          <ButtonLink href={odysseyHref} variant="secondary" size="sm" className="mt-space-2 gap-space-2 self-start">
            <Icon name="transmission" size={18} />
            {odysseyTitle ? interpolate(copy.missions.odysseyNamed, { title: odysseyTitle }) : copy.missions.odyssey}
          </ButtonLink>
        ) : null}
      </header>

      {board.total === 0 ? (
        <Card>
          <p className="type-body text-muted-foreground">{copy.missions.empty}</p>
        </Card>
      ) : (
        <>
          <Card className="gap-space-3 flex flex-col">
            <div className="gap-space-3 flex flex-wrap items-center justify-between">
              <p className="type-label text-foreground">
                {interpolate(copy.missions.summary, { done: String(board.completed), total: String(board.total) })}
              </p>
              <p className="gap-space-3 flex items-center">
                <span className="type-pixel-tag text-accent">
                  <span className="sr-only">{copy.missions.earned}: </span>
                  {interpolate(copy.missions.xp, { xp: formatNumber(board.xpEarned) })}
                </span>
                {board.creditsEarned > 0 ? (
                  <span className="type-pixel-tag text-gold">
                    <span className="sr-only">{copy.missions.earnedCredits}: </span>
                    {interpolate(copy.missions.credits, { n: formatNumber(board.creditsEarned) })}
                  </span>
                ) : null}
              </p>
            </div>
            <ProgressBar
              value={board.completed}
              max={board.total}
              label={copy.missions.summaryLabel}
              valueText={interpolate(copy.missions.summary, { done: String(board.completed), total: String(board.total) })}
            />
          </Card>

          {groups.map((group) => (
            <QuadrantSection key={group.key} group={group} missionHref={missionHref} enabledGames={enabledGames} />
          ))}
        </>
      )}
    </div>
  );
}

function QuadrantSection({ group, missionHref, enabledGames }: { group: Group; missionHref: (id: string) => string; enabledGames?: ReadonlySet<string> }) {
  const headingId = `missions-${group.key}`;
  const done = group.missions.filter((mission) => mission.status === "completed").length;
  return (
    <section aria-labelledby={headingId} className="gap-space-3 flex flex-col">
      <div className="gap-space-3 flex items-center">
        {group.quadrant ? <PixelPlanet kind={group.quadrant.planet} scale={2} /> : null}
        <h2 id={headingId} className="type-heading text-foreground flex-1">
          {group.quadrant?.name ?? copy.missions.otherQuadrant}
        </h2>
        <span className="type-caption text-muted-foreground">
          {interpolate(copy.missions.quadrantProgress, { done: String(done), total: String(group.missions.length) })}
        </span>
      </div>
      <ul className="gap-space-3 grid min-[760px]:grid-cols-2">
        {group.missions.map((mission) => (
          <li key={mission.id}>
            <MissionCard mission={mission} quadrant={group.quadrant} minigame={mission.minigame !== null && Boolean(enabledGames?.has(mission.minigame))} href={missionHref(mission.id)} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function statusLine(mission: BoardMission): string {
  if (mission.status === "completed") {
    return mission.creditsEarned > 0
      ? interpolate(copy.missions.earnedBoth, { xp: formatNumber(mission.xpEarned), credits: formatNumber(mission.creditsEarned) })
      : interpolate(copy.missions.earnedXp, { xp: formatNumber(mission.xpEarned) });
  }
  if (mission.status === "in-progress" && mission.attemptsLeft !== null) {
    return mission.attemptsLeft === 1
      ? copy.missions.attemptsLeft.one
      : interpolate(copy.missions.attemptsLeft.other, { n: String(mission.attemptsLeft) });
  }
  return copy.missions.status[mission.status];
}

/**
 * One mission: its type's icon on the left (a check once done), the title (the link over the whole card), the XP and
 * G-Credits it gives, the description, its tags (type, quadrant, mini-game) and how it stands for the cadet.
 */
function MissionCard({ mission, quadrant, minigame, href }: { mission: BoardMission; quadrant: BoardQuadrant | null; minigame: boolean; href: string }) {
  const completed = mission.status === "completed";
  const failed = mission.status === "failed";
  const status = copy.missions.status[mission.status];
  const line = statusLine(mission);
  return (
    <Card
      className={cn(
        "gap-space-3 has-[a:focus-visible]:ring-ring relative flex h-full transition-colors has-[a:focus-visible]:ring-[3px] hover:border-line-strong",
        completed && "border-accent/60",
        failed && "opacity-75",
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "bg-bg-deep relative grid size-12 shrink-0 place-items-center overflow-hidden rounded-md border",
          completed ? "border-accent/70 text-accent" : failed ? "border-border text-text-subtle" : "border-cyan/50 text-cyan",
        )}
      >
        {mission.imageUrl ? (
          <>
            <Image src={mission.imageUrl} alt="" fill unoptimized sizes="48px" className={cn("object-cover", failed && "grayscale")} />
            {completed ? (
              <span className="bg-accent text-on-accent absolute right-0 bottom-0 grid size-5 place-items-center rounded-tl-md">
                <Icon name="check" size={14} />
              </span>
            ) : null}
          </>
        ) : (
          <Icon name={completed ? "check" : MISSION_TYPE_ICON[mission.type]} size={22} />
        )}
      </span>
      <div className="gap-space-2 flex min-w-0 flex-1 flex-col">
        <div className="gap-space-2 flex items-start justify-between">
          <h3 className="type-label text-foreground">
            {/* The title is the link; it stretches over the whole card so any tap opens the mission. */}
            <Link href={href} className="after:absolute after:inset-0 after:rounded-lg focus-visible:outline-none">
              {mission.title}
            </Link>
          </h3>
          <span className="gap-space-1 flex shrink-0 flex-col items-end">
            <span className="type-pixel-tag text-primary">{interpolate(copy.missions.xp, { xp: formatNumber(mission.xp) })}</span>
            {mission.credits > 0 ? <span className="type-pixel-tag text-gold">{interpolate(copy.missions.credits, { n: formatNumber(mission.credits) })}</span> : null}
          </span>
        </div>
        {mission.description ? <p className="type-body-sm text-muted-foreground line-clamp-2">{mission.description}</p> : null}
        <MissionTags type={mission.type} quadrant={quadrant} minigame={minigame} />
        <p
          className={cn(
            "type-caption gap-space-1 mt-auto inline-flex items-center",
            completed ? "text-accent" : failed ? "text-text-subtle" : "text-muted-foreground",
          )}
        >
          {failed ? <Icon name="failed" size={16} /> : null}
          <span>
            {/* The status in words for screen readers when the visible line says something else (XP, tries left). */}
            {line !== status ? <span className="sr-only">{status}. </span> : null}
            {line}
          </span>
        </p>
      </div>
    </Card>
  );
}
