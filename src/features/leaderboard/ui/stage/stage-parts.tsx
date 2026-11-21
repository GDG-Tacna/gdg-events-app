"use client";

import { motion, useReducedMotion } from "framer-motion";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { copy } from "@/shared/copy/es";
import { formatNumber, interpolate } from "@/shared/lib/format";
import { cn } from "@/shared/lib/utils";
import type { PixelSpriteData } from "@/shared/types/pixel";
import { SquadArt } from "@/shared/ui";
import type { BoardCadet, SquadStanding } from "../../domain/ranking";
import type { StageChampions, StageRaffle, StageRaffleRule } from "../../domain/stage";

const t = copy.stage;

/** Each squad's pixel logo, with its uploaded logo's address when it has one. Squad logos by id, as plain data from the server (the catalog's 16 × 16 sprites). */
export type SquadSprites = Readonly<Record<string, PixelSpriteData & { logoUrl?: string | null }>>;

/** The next talk on the agenda, as the waiting screen announces it. */
export interface UpNext {
  title: string;
  who: string;
  /** `HH:mm` on the venue's clock. */
  time: string;
}

/** A card with the 2px ink border; the offset shadow marks the one that matters on the screen. */
const CARD = "border-ink border-2";
const OFFSET = "shadow-[0.8vh_0.8vh_0_var(--ink)]";

/** Rows already on the board that moved up since the last one, so they can flash once. */
function useClimbers(keys: readonly string[]): ReadonlySet<string> {
  const previous = useRef<Map<string, number> | null>(null);
  const [climbers, setClimbers] = useState<ReadonlySet<string>>(new Set());
  const signature = keys.join("|");
  useEffect(() => {
    const before = previous.current;
    const now = new Map(keys.map((key, index) => [key, index]));
    previous.current = now;
    if (!before) return;
    const up = new Set(keys.filter((key) => before.has(key) && (before.get(key) as number) > (now.get(key) as number)));
    if (up.size === 0) return;
    setClimbers(up);
    const clear = setTimeout(() => setClimbers(new Set()), 2500);
    return () => clearTimeout(clear);
    // The keys' order is the signature; the array itself changes on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);
  return climbers;
}

/** How big each of the first five places is drawn: the first stands out, the last two are the smallest. */
const PLACE_STYLE = [
  { card: "bg-gold text-on-accent rounded-lg px-[1.6vw] py-[2.2vh]", place: "text-[clamp(2.5rem,8vh,5.5rem)] w-[3ch]", alias: "text-[clamp(1.5rem,5vh,3.25rem)]", sub: "text-[clamp(0.9rem,2.4vh,1.75rem)]", xp: "text-[clamp(1.5rem,5.2vh,3.5rem)]" },
  { card: "bg-surface rounded-md px-[1.6vw] py-[1.4vh]", place: "text-[clamp(1.5rem,4.2vh,3rem)] w-[3ch]", alias: "text-[clamp(1.25rem,3.6vh,2.5rem)]", sub: "text-[clamp(0.85rem,2vh,1.5rem)]", xp: "text-[clamp(1.25rem,3.6vh,2.5rem)]" },
  { card: "bg-surface rounded-md px-[1.6vw] py-[1.4vh]", place: "text-[clamp(1.5rem,4.2vh,3rem)] w-[3ch]", alias: "text-[clamp(1.25rem,3.6vh,2.5rem)]", sub: "text-[clamp(0.85rem,2vh,1.5rem)]", xp: "text-[clamp(1.25rem,3.6vh,2.5rem)]" },
  { card: "bg-surface rounded-md px-[1.6vw] py-[1.1vh]", place: "text-[clamp(1.25rem,3.4vh,2.5rem)] w-[3ch]", alias: "text-[clamp(1.1rem,3vh,2.25rem)]", sub: "text-[clamp(0.8rem,1.8vh,1.4rem)]", xp: "text-[clamp(1.1rem,3vh,2.25rem)]" },
  { card: "bg-surface rounded-md px-[1.6vw] py-[1.1vh]", place: "text-[clamp(1.25rem,3.4vh,2.5rem)] w-[3ch]", alias: "text-[clamp(1.1rem,3vh,2.25rem)]", sub: "text-[clamp(0.8rem,1.8vh,1.4rem)]", xp: "text-[clamp(1.1rem,3vh,2.25rem)]" },
] as const;

/** The first five places as cards, and the rest (6 to 10) as a list in a panel beside them. */
export function CadetBoard({ cadets }: { cadets: readonly BoardCadet[] }) {
  const reduce = useReducedMotion();
  const climbers = useClimbers(cadets.map((cadet) => cadet.alias));
  if (cadets.length === 0) return <p className="text-muted-foreground text-[clamp(1.25rem,3vh,2.5rem)]">{t.empty}</p>;
  const podium = cadets.slice(0, 5);
  const rest = cadets.slice(5);
  return (
    <div className="grid min-h-0 flex-1 grid-cols-1 gap-[2vw] min-[900px]:grid-cols-[1.15fr_1fr]">
      <ol aria-label={t.cadetsTitle} className="flex min-h-0 flex-col gap-[1.6vh]">
        {podium.map((cadet, index) => {
          const style = PLACE_STYLE[index];
          return (
            <motion.li
              key={cadet.alias}
              layout={!reduce}
              transition={{ type: "spring", stiffness: 260, damping: 30 }}
              data-climbed={climbers.has(cadet.alias) ? "true" : undefined}
              className={cn(CARD, "grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-[1.5vw] transition-colors duration-700", style.card, index === 0 && OFFSET, climbers.has(cadet.alias) && "bg-cyan text-on-accent")}
            >
              <span className={cn("font-display text-center leading-none font-extrabold tabular-nums", style.place)}>{cadet.position}</span>
              <span className="flex min-w-0 flex-col">
                <span className={cn("font-display truncate leading-[1.15] font-extrabold", style.alias)}>{cadet.alias}</span>
                <span className={cn("truncate leading-[1.2] font-medium", style.sub, index === 0 ? "text-on-accent" : "text-muted-foreground")}>{cadet.squad ?? t.noSquad}</span>
              </span>
              <span className={cn("font-display leading-none font-extrabold tabular-nums", style.xp)}>{interpolate(t.xp, { n: formatNumber(cadet.xp) })}</span>
            </motion.li>
          );
        })}
      </ol>

      {rest.length > 0 ? (
        <div className={cn(CARD, "bg-surface flex min-h-0 flex-col gap-[0.6vh] rounded-lg px-[1.8vw] py-[2vh]")}>
          <p className="text-muted-foreground text-[clamp(0.85rem,2vh,1.5rem)] font-bold tracking-widest uppercase">{t.restTitle}</p>
          <ol aria-label={t.restTitle} className="flex flex-1 flex-col justify-between">
            {rest.map((cadet) => (
              <motion.li
                key={cadet.alias}
                layout={!reduce}
                transition={{ type: "spring", stiffness: 260, damping: 30 }}
                data-climbed={climbers.has(cadet.alias) ? "true" : undefined}
                className={cn("border-line grid grid-cols-[3ch_minmax(0,1fr)_auto] items-center gap-[1.2vw] border-b-2 py-[1vh] transition-colors duration-700 last:border-b-0", climbers.has(cadet.alias) && "bg-cyan/40")}
              >
                <span className="font-display text-[clamp(1.1rem,3vh,2.25rem)] font-extrabold tabular-nums">{cadet.position}</span>
                <span className="flex min-w-0 flex-col">
                  <span className="font-display truncate text-[clamp(1.1rem,3vh,2.25rem)] leading-[1.15] font-bold">{cadet.alias}</span>
                  <span className="text-muted-foreground truncate text-[clamp(0.8rem,1.8vh,1.4rem)] leading-[1.2]">{cadet.squad ?? t.noSquad}</span>
                </span>
                <span className="font-display text-[clamp(1.1rem,3vh,2.25rem)] font-bold tabular-nums">{interpolate(t.xp, { n: formatNumber(cadet.xp) })}</span>
              </motion.li>
            ))}
          </ol>
        </div>
      ) : null}
    </div>
  );
}

export function SquadBoard({ squads, sprites }: { squads: readonly SquadStanding[]; sprites: SquadSprites }) {
  const reduce = useReducedMotion();
  const top = Math.max(1, ...squads.map((squad) => squad.xp));
  return (
    <ol aria-label={t.squadsTitle} className="flex flex-col gap-[2vh]">
      {squads.map((squad) => {
        const sprite = sprites[squad.id];
        const first = squad.position === 1;
        return (
          <motion.li key={squad.id} layout={!reduce} className={cn(CARD, "flex flex-col gap-[1vh] rounded-lg px-[1.6vw] py-[1.6vh]", first ? cn("bg-gold text-on-accent", OFFSET) : "bg-surface")}>
            <div className="flex items-center gap-[1.5vw]">
              <span className="font-display text-[clamp(1.5rem,4.4vh,3.25rem)] leading-none font-extrabold tabular-nums">{squad.position}</span>
              {sprite ? <SquadArt sprite={sprite} logoUrl={sprite.logoUrl} scale={4} /> : null}
              <span className="font-display min-w-0 flex-1 truncate text-[clamp(1.25rem,3.8vh,3rem)] leading-[1.2] font-extrabold">{squad.name}</span>
              <span className="font-display text-[clamp(1.25rem,3.8vh,3rem)] font-extrabold tabular-nums">{interpolate(t.xp, { n: formatNumber(squad.xp) })}</span>
            </div>
            <div className={cn("h-[1.6vh] min-h-2 overflow-hidden rounded-full border-2", first ? "border-ink bg-on-accent/15" : "border-ink bg-background")} aria-hidden="true">
              <motion.div
                className={cn("h-full rounded-full", first ? "bg-ink" : "bg-violet")}
                initial={false}
                animate={{ width: `${Math.round((squad.xp / top) * 100)}%` }}
                transition={reduce ? { duration: 0 } : { duration: 0.8, ease: "easeOut" }}
              />
            </div>
            <span className={cn("text-[clamp(0.85rem,1.9vh,1.5rem)] font-medium", first ? "text-on-accent" : "text-muted-foreground")}>{squad.members === 1 ? t.oneMember : interpolate(t.members, { n: formatNumber(squad.members) })}</span>
          </motion.li>
        );
      })}
    </ol>
  );
}

/** The dark scene between talks: what comes next and when, or just the event's name when the agenda has nothing left. */
export function WaitingScreen({ next }: { next?: UpNext | null }) {
  return (
    <div className="flex flex-1 flex-col justify-between gap-[3vh] py-[2vh]">
      {next ? (
        <>
          <div className="flex flex-1 flex-col justify-center gap-[2.4vh]">
            <p className="text-gold text-[clamp(1rem,2.8vh,2rem)] font-bold tracking-widest uppercase">{t.waiting.next}</p>
            <p className="font-display max-w-[85%] text-[clamp(2.5rem,12vh,7.5rem)] leading-[1.02] font-extrabold">{next.title}</p>
            {next.who ? <p className="text-[clamp(1.25rem,4vh,2.5rem)] font-medium opacity-80">{next.who}</p> : null}
          </div>
          <div className="flex items-end justify-between gap-[3vw]">
            {next.time ? (
              <div className="border-on-ink flex items-center gap-[1.4vw] rounded-lg border-2 px-[2vw] py-[1.6vh]">
                <span className="text-[clamp(1rem,2.6vh,1.75rem)] font-medium opacity-80">{t.waiting.startsAt}</span>
                <span className="font-display text-[clamp(2rem,7vh,4.5rem)] leading-none font-extrabold tabular-nums">{next.time}</span>
              </div>
            ) : (
              <span />
            )}
            <p className="max-w-[30vw] text-right text-[clamp(1rem,2.6vh,1.75rem)] leading-[1.35] font-medium opacity-80">{t.waiting.hint}</p>
          </div>
        </>
      ) : (
        <div className="flex flex-1 flex-col justify-center gap-[2.4vh]">
          <p className="font-display text-[clamp(2.5rem,12vh,7.5rem)] leading-[1.02] font-extrabold">{t.waiting.title}</p>
          <p className="text-[clamp(1.25rem,4vh,2.5rem)] font-medium opacity-80">{t.waiting.body}</p>
        </div>
      )}
    </div>
  );
}

/** How long the reel spins through names before it lands on the winner. */
export const REEL_MS = 4500;

/** Who took part in a draw, as the chip under the reel says it. */
function ruleText(rule: StageRaffleRule): string {
  if (rule.kind === "top") return interpolate(t.raffle.ruleTop, { n: formatNumber(rule.n) });
  if (rule.kind === "xp") return interpolate(t.raffle.ruleXp, { min: formatNumber(rule.min) });
  return t.raffle.rule;
}

/**
 * A raffle draw on the blue scene: the prize, then the reel spinning through entrants' names, slowing down, until it
 * lands on the winner. With reduced motion the winner shows at once. Mount it keyed by the draw, so each draw spins its
 * own reel. A top N or XP minimum draw gives every cadet one ticket, so it counts cadets instead of tickets.
 */
export function RaffleScreen({ raffle }: { raffle: StageRaffle }) {
  const reduce = useReducedMotion();
  const equalChance = raffle.rule.kind !== "credits";
  const names = raffle.reel.length > 0 ? raffle.reel : [raffle.winner.alias];
  const [index, setIndex] = useState(reduce ? names.length - 1 : 0);
  const landed = index >= names.length - 1;

  // The screen is mounted once per draw (keyed by its id), so the reel starts from its initial state.
  useEffect(() => {
    if (reduce) return;
    // Each step a little slower than the last, adding up to REEL_MS.
    const steps = names.length - 1;
    const timers: ReturnType<typeof setTimeout>[] = [];
    let elapsed = 0;
    for (let step = 1; step <= steps; step += 1) {
      elapsed += (REEL_MS * 2 * step) / (steps * (steps + 1));
      timers.push(setTimeout(() => setIndex(step), Math.round(elapsed)));
    }
    return () => timers.forEach(clearTimeout);
    // The names belong to this draw, which never changes while mounted.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduce]);

  return (
    <div className="flex flex-1 flex-col items-center justify-between gap-[3vh] py-[1vh] text-center">
      <div className="flex flex-col items-center gap-[1.2vh]">
        <p className="text-[clamp(1rem,2.8vh,2rem)] font-bold tracking-widest uppercase">{t.raffle.title}</p>
        <div className="flex items-center gap-[2vw]">
          {raffle.prizeImageUrl ? (
            <Image src={raffle.prizeImageUrl} alt="" width={1024} height={1024} unoptimized priority className="border-on-ink bg-surface h-[14vh] w-auto max-w-[18vw] rounded-md border-2 object-contain" />
          ) : null}
          <div className="flex flex-col items-start gap-[0.4vh] text-left">
            <p className="text-[clamp(0.9rem,2.2vh,1.6rem)] font-bold tracking-widest uppercase opacity-90">{t.raffle.prize}</p>
            <h2 className="font-display text-[clamp(1.75rem,5.4vh,3.5rem)] leading-[1.1] font-extrabold">{raffle.prizeName}</h2>
          </div>
        </div>
      </div>

      <div aria-live="off" className="flex flex-col items-center gap-[2vh]">
        <p className="text-[clamp(1rem,2.8vh,2rem)] font-bold">{landed ? t.raffle.winner : t.raffle.spinning}</p>
        <div className={cn("border-ink bg-surface text-foreground flex min-w-[min(70vw,900px)] flex-col items-center gap-[1vh] rounded-lg border-[3px] px-[4vw] py-[3.5vh]", OFFSET)}>
          <p data-testid="raffle-reel" className="font-display max-w-[80vw] truncate text-[clamp(2.5rem,12vh,8rem)] leading-[1.2] font-extrabold">
            {names[Math.min(index, names.length - 1)]}
          </p>
          {landed ? (
            <p className="text-muted-foreground text-[clamp(1rem,2.8vh,2rem)] font-medium">
              {raffle.winner.squad ?? t.noSquad} ·{" "}
              <span className="text-lime-ink font-bold">
                {equalChance
                  ? interpolate(t.raffle.oneOf, { total: formatNumber(raffle.totalTickets) })
                  : interpolate(t.raffle.tickets, { n: formatNumber(raffle.tickets), total: formatNumber(raffle.totalTickets) })}
              </span>
            </p>
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-[1.6vw] text-[clamp(0.95rem,2.4vh,1.6rem)] font-bold">
        <span className="rounded-full border-2 border-current px-[1.4vw] py-[0.8vh]">{interpolate(equalChance ? t.raffle.inPlayCadets : t.raffle.inPlay, { n: formatNumber(raffle.totalTickets) })}</span>
        <span className="rounded-full border-2 border-current px-[1.4vw] py-[0.8vh]">{ruleText(raffle.rule)}</span>
      </div>

      {/* Screen readers hear the result once, not every name the reel flashes. */}
      <p role="status" className="sr-only">
        {landed ? `${t.raffle.winner} ${raffle.winner.alias}, ${raffle.prizeName}` : t.raffle.spinning}
      </p>
    </div>
  );
}

/** One step of the podium: the name, its XP and the block that sets its height. */
function Pedestal({ place, cadet, height, className, size }: { place: number; cadet: BoardCadet; height: string; className: string; size: "big" | "small" }) {
  return (
    <div className="flex flex-col items-center gap-[1vh]">
      <p className={cn("font-display max-w-full truncate text-center leading-[1.15] font-extrabold", size === "big" ? "text-[clamp(1.75rem,6vh,4rem)]" : "text-[clamp(1.25rem,4vh,2.75rem)]")}>{cadet.alias}</p>
      <p className="text-muted-foreground text-[clamp(0.9rem,2.4vh,1.75rem)] font-medium">
        {size === "big" ? `${cadet.squad ?? t.noSquad} · ` : null}
        {interpolate(t.xp, { n: formatNumber(cadet.xp) })}
      </p>
      <div className={cn(CARD, "font-display flex w-full items-start justify-center rounded-t-lg pt-[1.6vh] leading-none font-extrabold", height, className, size === "big" ? cn("text-[clamp(3rem,12vh,7rem)]", OFFSET) : "text-[clamp(2rem,7vh,4.5rem)]")}>{place}</div>
    </div>
  );
}

/** The champions: the podium of the first three cadets, and the champion squad on a bar under it. */
export function RevealScreen({ champions, sprites }: { champions: StageChampions | null; sprites: SquadSprites }) {
  const reduce = useReducedMotion();
  const enter = (delay: number) => (reduce ? {} : { initial: { opacity: 0, scale: 0.85, y: 24 }, animate: { opacity: 1, scale: 1, y: 0 }, transition: { delay, duration: 0.7, ease: "easeOut" as const } });
  const cadet = champions?.cadet ?? null;
  const squad = champions?.squad ?? null;
  const [second, third] = champions?.runnersUp ?? [];
  const sprite = squad ? sprites[squad.id] : undefined;
  return (
    <div className="flex flex-1 flex-col gap-[3vh]">
      <div className="flex flex-col items-center gap-[0.6vh] text-center">
        <p className="text-violet-ink text-[clamp(1rem,2.8vh,2rem)] font-bold tracking-widest uppercase">{t.reveal.title}</p>
        <motion.h2 {...enter(0)} className="font-display text-[clamp(2rem,7vh,4.75rem)] leading-[1.05] font-extrabold">
          {t.reveal.congrats}
        </motion.h2>
      </div>

      <div className="grid flex-1 grid-cols-[1fr_1.2fr_1fr] items-end gap-[2vw]">
        <motion.div {...enter(1.2)} aria-label={t.reveal.second} role="group">
          {second ? <Pedestal place={2} cadet={second} height="h-[24vh]" className="bg-secondary" size="small" /> : null}
        </motion.div>
        <motion.section {...enter(2.4)} aria-label={t.reveal.cadet}>
          {cadet ? (
            <Pedestal place={1} cadet={cadet} height="h-[34vh]" className="bg-gold text-on-accent" size="big" />
          ) : (
            <p className="font-display text-center text-[clamp(1.5rem,5vh,3.5rem)] font-bold">{t.reveal.none}</p>
          )}
        </motion.section>
        <motion.div {...enter(1.8)} aria-label={t.reveal.third} role="group">
          {third ? <Pedestal place={3} cadet={third} height="h-[17vh]" className="bg-magenta text-on-accent" size="small" /> : null}
        </motion.div>
      </div>

      <motion.section {...enter(3.2)} aria-label={t.reveal.squad} className={cn(CARD, "bg-surface flex items-center justify-center gap-[1.6vw] rounded-md px-[2vw] py-[1.6vh] text-[clamp(1.1rem,3vh,2.25rem)] font-bold")}>
        <span className="text-muted-foreground font-medium">{t.reveal.squad}</span>
        {sprite ? <SquadArt sprite={sprite} logoUrl={sprite.logoUrl} scale={3} /> : null}
        <span className="font-display max-w-[40vw] truncate">{squad ? squad.name : t.reveal.none}</span>
        {squad ? <span className="text-muted-foreground font-medium">· {interpolate(t.xp, { n: formatNumber(squad.xp) })}</span> : null}
      </motion.section>
    </div>
  );
}
