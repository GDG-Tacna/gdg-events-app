"use client";

import { motion } from "framer-motion";
import type { ReactNode } from "react";
import { useMotionSafe } from "@/shared/motion/use-motion-safe";

/** Screen entrance: fades in and rises 10px; instant when the user prefers reduced motion. */
export function ScreenEnter({ children, className }: { children: ReactNode; className?: string }) {
  const { screenEnter } = useMotionSafe();
  return (
    <motion.div
      className={className}
      initial={screenEnter.initial}
      animate={screenEnter.animate}
      transition={{ ...screenEnter.transition, ease: [...screenEnter.transition.ease] }}
    >
      {children}
    </motion.div>
  );
}
