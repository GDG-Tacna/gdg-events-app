import type { SVGProps } from "react";

/** The few line icons the console needs that the app's icon set does not have. Same look: stroke, round caps. */
const PATHS = {
  video: ["M5 4l14 8-14 8z"],
  slides: ["M3 4h18v12H3z", "M8 20h8", "M12 16v4"],
  pause: ["M7 5h4v14H7z", "M13 5h4v14h-4z"],
  stop: ["M6 6h12v12H6z"],
  previous: ["M19 5l-9 7 9 7z", "M6 5v14"],
  next: ["M5 5l9 7-9 7z", "M18 5v14"],
  freeze: ["M12 2v20", "M4 6l16 12", "M20 6L4 18"],
  eye: ["M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z", "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z"],
  clock: ["M12 7v5l3 2", "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z"],
  warning: ["M12 3l10 18H2z", "M12 10v5", "M12 18v.01"],
} as const;

export type ConsoleIconName = keyof typeof PATHS;

export function ConsoleIcon({ name, size = 20, ...props }: { name: ConsoleIconName; size?: number } & Omit<SVGProps<SVGSVGElement>, "name">) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      {PATHS[name].map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}
