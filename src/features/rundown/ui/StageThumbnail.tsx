"use client";

import { useEffect, useRef, useState } from "react";

/** The size the projector's screen is drawn at inside the frame, so its type and layout are the real ones. */
const STAGE_WIDTH = 1280;
const STAGE_HEIGHT = 720;

export interface StageThumbnailProps {
  /** The stage screen's address in its preview mode. */
  src: string;
  /** The accessible name of the copy. */
  label: string;
}

/**
 * A small, live copy of the projector's screen: the stage page itself, drawn at 1280 x 720 and shrunk to the box it
 * is in. It cannot be clicked or focused (it is only to look at), and being the real page it follows the ranking, the
 * QR, the raffle and the pieces on the air exactly as the audience sees them.
 */
export function StageThumbnail({ src, label }: StageThumbnailProps) {
  const box = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.25);

  useEffect(() => {
    const element = box.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    const measure = () => setScale(element.clientWidth / STAGE_WIDTH || 0.25);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={box} className="absolute inset-0 overflow-hidden bg-[#1e1e1e]">
      <iframe
        title={label}
        src={src}
        tabIndex={-1}
        loading="lazy"
        // The same site, so its scripts and its session cookie work; nothing else is allowed.
        sandbox="allow-scripts allow-same-origin"
        style={{ width: STAGE_WIDTH, height: STAGE_HEIGHT, transform: `scale(${scale})`, transformOrigin: "top left" }}
        className="pointer-events-none absolute top-0 left-0 border-0"
      />
    </div>
  );
}
