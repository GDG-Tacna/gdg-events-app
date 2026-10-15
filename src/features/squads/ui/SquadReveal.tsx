"use client";

import { motion } from "framer-motion";
import { useEffect, useRef } from "react";
import { copy } from "@/shared/copy/es";
import { useMotionSafe } from "@/shared/motion/use-motion-safe";
import type { SquadId } from "@/shared/types/squad";
import {
  ArtTile,
  BrandMark,
  Button,
  ButtonLink,
  Card,
  InlineAlert,
  PixelPlanet,
  SquadArt,
} from "@/shared/ui";
import type { Squad } from "../domain/squad";
import type { AssignSquadAction } from "./assignment";
import { useSquadAssignment } from "./use-squad-assignment";

export interface SquadRevealProps {
  /** Every squad of the edition: the active ones are previewed, and the result is described from the full list. */
  squads: readonly Squad[];
  /** The server action that assigns (or returns) the squad of the signed-in attendee. */
  assign: AssignSquadAction;
  /** The squad the attendee already has: the screen then opens revealed. */
  initialSquad: SquadId | null;
  /** Where "continue" goes once the squad is known. */
  continueHref: string;
}

/**
 * Squad reveal. States: idle (the squad logos and a button), pending (button busy), revealed (the
 * squad logo grows into place, announced to screen readers, with a way forward) and error (alert
 * above the button, retry is safe because the server action is idempotent).
 * An attendee whose squad is no longer in the catalog (retired later) still sees a sensible screen.
 */
export function SquadReveal({ squads, assign, initialSquad, continueHref }: SquadRevealProps) {
  const { status, squad: squadId, errorCode, assign: run } = useSquadAssignment(assign, initialSquad);
  const { reveal } = useMotionSafe();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const previousStatus = useRef(status);

  const pending = status === "pending";
  const revealedId = status === "revealed" ? squadId : null;
  const revealed = revealedId === null ? null : (squads.find((squad) => squad.id === revealedId) ?? null);

  // Move focus to the squad name only when the reveal was just triggered, not on first paint.
  useEffect(() => {
    if (previousStatus.current === "pending" && status === "revealed") headingRef.current?.focus();
    previousStatus.current = status;
  }, [status]);

  return (
    <Card tone="cyan" className="gap-space-6 flex flex-col">
      <BrandMark />

      {revealedId !== null ? (
        <>
          <div role="status" className="gap-space-4 flex flex-col items-center text-center">
            <motion.div
              initial={reveal.initial}
              animate={reveal.animate}
              transition={{ ...reveal.transition, ease: [...reveal.transition.ease] }}
            >
              <ArtTile className="p-space-4">
                {revealed ? (
                  <SquadArt sprite={revealed.sprite} logoUrl={revealed.logo?.url} scale={10} />
                ) : (
                  <PixelPlanet kind="gdg" scale={10} />
                )}
              </ArtTile>
            </motion.div>
            <div className="gap-space-1 flex flex-col">
              <p className="type-caption text-text-subtle">{copy.reveal.yourSquad}</p>
              <h1 ref={headingRef} tabIndex={-1} className="type-title-xl text-foreground outline-none">
                {revealed?.name ?? revealedId}
              </h1>
              {revealed ? <p className="type-body text-muted-foreground">{revealed.tagline}</p> : null}
            </div>
          </div>
          <ButtonLink href={continueHref} variant="primary" size="lg" block>
            {copy.reveal.continue}
          </ButtonLink>
        </>
      ) : (
        <>
          <div className="gap-space-2 flex flex-col">
            <h1 className="type-title text-foreground">{copy.reveal.title}</h1>
            <p className="type-body text-muted-foreground">{copy.reveal.subtitle}</p>
          </div>
          <div className="flex justify-center">
            <ArtTile className="gap-space-3 flex-wrap justify-center">
              {squads.filter((squad) => squad.active).map((squad) => (
                <SquadArt
                  key={squad.id}
                  sprite={squad.sprite}
                  logoUrl={squad.logo?.url}
                  scale={4}
                  className={pending ? "animate-pulse" : undefined}
                />
              ))}
            </ArtTile>
          </div>
          {status === "error" && errorCode ? <InlineAlert>{copy.reveal.errors[errorCode]}</InlineAlert> : null}
          <Button block size="lg" loading={pending} onClick={run}>
            {pending ? copy.reveal.discovering : copy.reveal.discover}
          </Button>
        </>
      )}
    </Card>
  );
}
