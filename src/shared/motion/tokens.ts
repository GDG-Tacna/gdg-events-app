/** Motion tokens from the Design System. Durations are in seconds (Framer Motion). */
export const duration = {
  press: 0.12,
  enter: 0.28,
  progress: 0.6,
  reveal: 0.5,
} as const;

export const easing = {
  enter: [0.2, 0.8, 0.2, 1],
} as const satisfies Record<string, readonly [number, number, number, number]>;

export const screenEnter = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: duration.enter, ease: easing.enter },
} as const;

/** Reward moments (a squad reveal): the piece grows into place while it fades in. */
export const reveal = {
  initial: { opacity: 0, scale: 0.8 },
  animate: { opacity: 1, scale: 1 },
  transition: { duration: duration.reveal, ease: easing.enter },
} as const;

export const pressScale = 0.97;

/** Used when the user prefers reduced motion: same end state, no movement. */
export const instant = {
  initial: { opacity: 1, y: 0 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0, ease: easing.enter },
} as const;

/** Reduced-motion twin of `reveal`: it starts at its final state. */
export const instantReveal = {
  initial: { opacity: 1, scale: 1 },
  animate: { opacity: 1, scale: 1 },
  transition: { duration: 0, ease: easing.enter },
} as const;
