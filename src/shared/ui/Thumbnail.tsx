import Image from "next/image";
import { cn } from "@/shared/lib/utils";

export interface ThumbnailProps {
  /** An uploaded image's address (already sized by the server). */
  url: string;
  /** Side in pixels. */
  size?: number;
  className?: string;
}

/** A small framed photo next to a name (a prize, a logo). Decorative: the name beside it says what it is. */
export function Thumbnail({ url, size = 56, className }: ThumbnailProps) {
  return (
    <Image
      src={url}
      alt=""
      width={size}
      height={size}
      unoptimized
      className={cn("bg-bg-deep border-line-strong shrink-0 rounded-md border object-contain", className)}
      style={{ width: size, height: size }}
    />
  );
}
