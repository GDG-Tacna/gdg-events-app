"use client";

import { motion, useReducedMotion } from "framer-motion";
import { copy } from "@/shared/copy/es";
import { ButtonLink } from "./ButtonLink";
import { MedalArt } from "./MedalArt";

export interface UnlockedBadgesProps {
  /** Badges a scan or a mission just unlocked; nothing is drawn when empty. */
  badges: ReadonlyArray<{ id: string; name: string; tone: string; imageUrl?: string | null }>;
  /** The Logros tab, or nothing to leave the link out. */
  href?: string;
  /** The box rises into place and each medal spins in, after `delay` seconds. Static under reduced motion. */
  animated?: boolean;
  delay?: number;
}

/** "¡Logro desbloqueado!" with each new badge's medal and name, under a scan or a mission result. */
export function UnlockedBadges({ badges, href, animated = false, delay = 0 }: UnlockedBadgesProps) {
  const reduce = useReducedMotion();
  if (badges.length === 0) return null;
  const t = copy.achievements.unlocked;
  const move = animated && !reduce;
  return (
    <motion.div
      className="border-accent/60 bg-accent/10 p-space-3 gap-space-3 flex flex-col rounded-md border"
      initial={move ? { opacity: 0, y: 24 } : false}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay }}
    >
      <p className="type-label text-foreground">{t.title}</p>
      <ul aria-label={t.label} className="gap-space-2 flex flex-col">
        {badges.map((badge, index) => (
          <li key={badge.id} className="gap-space-3 flex items-center">
            <motion.span
              className="shrink-0"
              initial={move ? { rotateY: 360, scale: 0.3 } : false}
              animate={{ rotateY: 0, scale: 1 }}
              transition={{ type: "spring", stiffness: 140, damping: 14, delay: delay + 0.15 + index * 0.15 }}
            >
              <MedalArt tone={badge.tone} imageUrl={badge.imageUrl} scale={2} className="shrink-0" />
            </motion.span>
            <span className="type-label text-foreground">{badge.name}</span>
          </li>
        ))}
      </ul>
      {href ? (
        <ButtonLink href={href} variant="secondary" size="sm" className="self-start">
          {t.see}
        </ButtonLink>
      ) : null}
    </motion.div>
  );
}
