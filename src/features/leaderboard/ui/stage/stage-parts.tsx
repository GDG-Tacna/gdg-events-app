"use client";

import { motion, useReducedMotion } from "framer-motion";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { copy } from "@/shared/copy/es";
import { formatNumber, interpolate } from "@/shared/lib/format";
import { cn } from "@/shared/lib/utils";
import type { PixelSpriteData } from "@/shared/types/pixel";
import { PixelPlanet, PixelStar, SquadArt } from "@/shared/ui";
import type { BoardCadet, SquadStanding } from "../../domain/ranking";
import type { StageChampions, StageRaffle } from "../../domain/stage";

const t = copy.stage;

/** Squad logos by id, as plain data from the server (the catalog's 16 × 16 sprites). */
/** Each squad's pixel logo, with its uploaded logo's address when it has one. */
export type SquadSprites = Readonly<Record<string, PixelSpriteData & { logoUrl?: string | null }>>;

const PLACE_TONE = ["text-gold", "text-foreground", "text-violet-soft"];

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

export function CadetBoard({ cadets }: { cadets: readonly BoardCadet[] }) {
  const reduce = useReducedMotion();
  const climbers = useClimbers(cadets.map((cadet) => cadet.alias));
  if (cadets.length === 0) return <p className="text-muted-foreground text-[clamp(1.25rem,3vh,2.5rem)]">{t.empty}</p>;
  return (
    // Two columns (1-5, 6-10) on wide screens, so the top 10 fits a 16:9 projector without scrolling.
    <ol aria-label={t.cadetsTitle} className="flex flex-col gap-[1.2vh] min-[1100px]:grid min-[1100px]:max-h-[80vh] min-[1100px]:flex-1 min-[1100px]:grid-flow-col min-[1100px]:grid-cols-2 min-[1100px]:grid-rows-5 min-[1100px]:gap-x-[3vw] min-[1100px]:gap-y-[2vh]">
      {cadets.map((cadet) => (
        <motion.li
          key={cadet.alias}
          layout={!reduce}
          transition={{ type: "spring", stiffness: 260, damping: 30 }}
          data-climbed={climbers.has(cadet.alias) ? "true" : undefined}
          className={cn(
            "bg-surface/80 border-border grid grid-cols-[3ch_minmax(0,1fr)_auto] items-center gap-[1.5vw] rounded-lg border px-[1.5vw] py-[1.2vh] transition-colors duration-700",
            cadet.position === 1 && "border-gold/70",
            climbers.has(cadet.alias) && "border-accent bg-accent/10",
          )}
        >
          <span className={cn("type-pixel-tag text-[clamp(1.25rem,3.4vh,3rem)] tabular-nums", PLACE_TONE[cadet.position - 1] ?? "text-text-subtle")}>{cadet.position}</span>
          <span className="flex min-w-0 flex-col">
            <span className="font-display truncate text-[clamp(1.25rem,4vh,3.5rem)] leading-[1.2] font-semibold">{cadet.alias}</span>
            <span className="text-text-subtle truncate text-[clamp(0.85rem,2.2vh,1.75rem)] leading-[1.2]">{cadet.squad ?? t.noSquad}</span>
          </span>
          <span className="font-display text-accent text-[clamp(1.25rem,3.2vh,2.75rem)] font-semibold tabular-nums">{interpolate(t.xp, { n: formatNumber(cadet.xp) })}</span>
        </motion.li>
      ))}
    </ol>
  );
}

export function SquadBoard({ squads, sprites }: { squads: readonly SquadStanding[]; sprites: SquadSprites }) {
  const reduce = useReducedMotion();
  const top = Math.max(1, ...squads.map((squad) => squad.xp));
  return (
    <ol aria-label={t.squadsTitle} className="flex flex-col gap-[2.5vh]">
      {squads.map((squad) => {
        const sprite = sprites[squad.id];
        return (
          <motion.li key={squad.id} layout={!reduce} className="flex flex-col gap-[1vh]">
            <div className="flex items-center gap-[1.5vw]">
              <span className={cn("type-pixel-tag text-[clamp(1.25rem,3.4vh,3rem)]", PLACE_TONE[squad.position - 1] ?? "text-text-subtle")}>{squad.position}</span>
              {sprite ? <SquadArt sprite={sprite} logoUrl={sprite.logoUrl} scale={4} /> : null}
              <span className="font-display min-w-0 flex-1 truncate text-[clamp(1.25rem,3.6vh,3.25rem)] leading-[1.2] font-semibold">{squad.name}</span>
              <span className="font-display text-accent text-[clamp(1.25rem,3.4vh,3rem)] font-semibold tabular-nums">{interpolate(t.xp, { n: formatNumber(squad.xp) })}</span>
            </div>
            <div className="bg-bg-deep h-[1.6vh] min-h-2 overflow-hidden rounded-full" aria-hidden="true">
              <motion.div
                className={cn("h-full rounded-full", squad.position === 1 ? "bg-gold" : "bg-primary")}
                initial={false}
                animate={{ width: `${Math.round((squad.xp / top) * 100)}%` }}
                transition={reduce ? { duration: 0 } : { duration: 0.8, ease: "easeOut" }}
              />
            </div>
            <span className="text-text-subtle text-[clamp(0.85rem,1.8vh,1.5rem)]">{squad.members === 1 ? t.oneMember : interpolate(t.members, { n: formatNumber(squad.members) })}</span>
          </motion.li>
        );
      })}
    </ol>
  );
}

export function WaitingScreen() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-[3vh] text-center">
      <PixelPlanet kind="gdg" scale={8} />
      <p className="font-display text-[clamp(2rem,7vh,6rem)] leading-tight font-bold">{t.waiting.title}</p>
      <p className="text-muted-foreground text-[clamp(1.25rem,3.2vh,2.75rem)]">{t.waiting.body}</p>
    </div>
  );
}

/** How long the reel spins through names before it lands on the winner. */
export const REEL_MS = 4500;

/**
 * A raffle draw: the prize, then the reel spinning through entrants' names, slowing down, until it lands on the
 * winner. With reduced motion the winner shows at once. Mount it keyed by the draw, so each draw spins its own reel.
 */
export function RaffleScreen({ raffle }: { raffle: StageRaffle }) {
  const reduce = useReducedMotion();
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
    <div className="flex flex-1 flex-col items-center justify-center gap-[4vh] text-center">
      <p className="text-primary text-[clamp(1rem,2.8vh,2.5rem)] font-semibold tracking-widest uppercase">{t.raffle.title}</p>
      {raffle.prizeImageUrl ? (
        <Image
          src={raffle.prizeImageUrl}
          alt=""
          width={1024}
          height={1024}
          unoptimized
          priority
          className="border-gold/60 bg-bg-deep h-[24vh] w-auto max-w-[40vw] rounded-lg border object-contain"
        />
      ) : null}
      <h2 className="font-display text-gold text-[clamp(2rem,7vh,6rem)] font-bold">{raffle.prizeName}</h2>
      <div
        aria-live="off"
        className={cn("bg-surface flex min-w-[min(80vw,1100px)] flex-col items-center gap-[1.5vh] rounded-lg border px-[4vw] py-[5vh]", landed ? "border-gold/80 shadow-[var(--shadow-glow-gold)]" : "border-border")}
      >
        <p className="text-text-subtle text-[clamp(1rem,2.4vh,2rem)] tracking-wide uppercase">{landed ? t.raffle.winner : t.raffle.spinning}</p>
        <p data-testid="raffle-reel" className={cn("font-display max-w-full truncate text-[clamp(2.5rem,9vh,8rem)] leading-[1.2] font-bold", landed ? "text-foreground" : "text-muted-foreground")}>
          {names[Math.min(index, names.length - 1)]}
        </p>
        {landed ? (
          <p className="text-muted-foreground text-[clamp(1rem,2.8vh,2.5rem)]">
            {raffle.winner.squad ?? t.noSquad} · <span className="text-accent">{interpolate(t.raffle.tickets, { n: formatNumber(raffle.tickets), total: formatNumber(raffle.totalTickets) })}</span>
          </p>
        ) : null}
      </div>
      {/* Screen readers hear the result once, not every name the reel flashes. */}
      <p role="status" className="sr-only">
        {landed ? `${t.raffle.winner} ${raffle.winner.alias}, ${raffle.prizeName}` : t.raffle.spinning}
      </p>
    </div>
  );
}

export function RevealScreen({ champions, sprites }: { champions: StageChampions | null; sprites: SquadSprites }) {
  const reduce = useReducedMotion();
  const enter = (delay: number) => (reduce ? {} : { initial: { opacity: 0, scale: 0.85, y: 24 }, animate: { opacity: 1, scale: 1, y: 0 }, transition: { delay, duration: 0.7, ease: "easeOut" as const } });
  const cadet = champions?.cadet ?? null;
  const squad = champions?.squad ?? null;
  const sprite = squad ? sprites[squad.id] : undefined;
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-[5vh] text-center">
      <motion.h2 {...enter(0)} className="font-display text-gold flex items-center gap-[2vw] text-[clamp(2rem,7vh,6rem)] font-bold">
        <PixelStar scale={6} />
        {t.reveal.title}
        <PixelStar scale={6} />
      </motion.h2>
      <div className="grid w-full max-w-[1400px] gap-[3vw] min-[900px]:grid-cols-2">
        <motion.section {...enter(1.2)} aria-label={t.reveal.cadet} className="bg-surface border-gold/70 flex flex-col items-center gap-[1.5vh] rounded-lg border px-[3vw] py-[4vh] shadow-[var(--shadow-glow-gold)]">
          <p className="text-text-subtle text-[clamp(1rem,2.4vh,2rem)] tracking-wide uppercase">{t.reveal.cadet}</p>
          <p className="font-display max-w-full truncate text-[clamp(2rem,7vh,6rem)] leading-[1.2] font-bold">{cadet ? cadet.alias : t.reveal.none}</p>
          {cadet ? (
            <p className="text-muted-foreground text-[clamp(1rem,2.6vh,2.25rem)]">
              {cadet.squad ?? t.noSquad} · <span className="text-accent">{interpolate(t.xp, { n: formatNumber(cadet.xp) })}</span>
            </p>
          ) : null}
        </motion.section>
        <motion.section {...enter(2.4)} aria-label={t.reveal.squad} className="bg-surface border-border flex flex-col items-center gap-[1.5vh] rounded-lg border px-[3vw] py-[4vh]">
          <p className="text-text-subtle text-[clamp(1rem,2.4vh,2rem)] tracking-wide uppercase">{t.reveal.squad}</p>
          {sprite ? <SquadArt sprite={sprite} logoUrl={sprite.logoUrl} scale={6} /> : null}
          <p className="font-display max-w-full truncate text-[clamp(1.75rem,4.6vh,4.25rem)] leading-[1.2] font-bold">{squad ? squad.name : t.reveal.none}</p>
          {squad ? <p className="text-accent text-[clamp(1rem,2.6vh,2.25rem)]">{interpolate(t.xp, { n: formatNumber(squad.xp) })}</p> : null}
        </motion.section>
      </div>
    </div>
  );
}
