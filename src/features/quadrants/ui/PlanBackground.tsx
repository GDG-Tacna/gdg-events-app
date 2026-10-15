import Image from "next/image";

/** Area fills over a real plan: see-through, so the plan shows under every area. */
export const ON_PLAN = "bg-bg-deep/55";

/**
 * The venue's real plan, stretched to the grid so plan units land on the same spot of the drawing. Decorative:
 * the areas on top are what the screen describes.
 */
export function PlanBackground({ url }: { url: string }) {
  return <Image src={url} alt="" fill unoptimized priority sizes="520px" draggable={false} className="pointer-events-none object-fill select-none" />;
}
