"use client";

import { useReducedMotion } from "framer-motion";
import { instant, instantReveal, reveal, screenEnter } from "./tokens";

/** The single place that decides whether animations run. Components never read the media query. */
export function useMotionSafe() {
  const reduced = useReducedMotion() ?? false;
  return {
    reduced,
    screenEnter: reduced ? instant : screenEnter,
    reveal: reduced ? instantReveal : reveal,
  };
}
