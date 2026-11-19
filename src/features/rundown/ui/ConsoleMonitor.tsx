import type { ReactNode } from "react";
import { cn } from "@/shared/lib/utils";

export interface ConsoleMonitorProps {
  /** `live` is what the audience sees now; `next` is what comes when the operator takes it. */
  tone: "live" | "next";
  /** The small tag in the header: «EN PANTALLA» or «SIGUIENTE». */
  tag: string;
  title: string;
  /** A short state on the right of the header: «Reproduciendo», «Lámina 3 de 18». */
  status?: string;
  /** The picture of the piece when it can be shown (a slide, an image); otherwise the icon stands for it. */
  preview?: ReactNode;
  /** The stand-in when there is no picture. */
  icon: ReactNode;
  /** Names the monitor for assistive technology. */
  label: string;
  className?: string;
}

/**
 * A little screen of the console: the header (tag, name, state) and a 16:9 picture of what is on the big screen (or
 * will be). The picture is the real thing whenever the console can draw it; the icon with the name stands in only for a
 * piece that has no picture (or while it is being read).
 */
export function ConsoleMonitor({ tone, tag, title, status, preview, icon, label, className }: ConsoleMonitorProps) {
  const live = tone === "live";
  return (
    <section aria-label={label} className={cn("bg-surface overflow-hidden rounded-lg border-2", live ? "border-danger" : "border-lime", className)}>
      <div className="gap-space-3 px-space-4 flex items-center py-2.5">
        <span className={cn("type-caption text-on-accent inline-flex h-[22px] items-center gap-1.5 rounded-full px-2.5 font-bold tracking-wider", live ? "bg-danger" : "bg-lime")}>
          {live ? <span aria-hidden="true" className="bg-on-accent size-2 rounded-full" /> : null}
          {tag}
        </span>
        <span className="type-label text-foreground min-w-0 flex-1 truncate">{title}</span>
        {status ? <span className="type-caption text-text-subtle shrink-0 font-mono">{status}</span> : null}
      </div>
      <div className="relative aspect-video w-full overflow-hidden bg-[#1e1e1e] text-[#f0f0f0]">
        {preview ?? (
          <div className="gap-space-2 absolute inset-0 flex flex-col items-center justify-center text-center">
            <span aria-hidden="true" className="text-[#57caff]">
              {icon}
            </span>
            <span className="type-label px-space-4 line-clamp-2">{title}</span>
          </div>
        )}
      </div>
    </section>
  );
}
