"use client";

import { copy } from "@/shared/copy/es";
import { interpolate } from "@/shared/lib/format";
import { cn } from "@/shared/lib/utils";
import { Icon } from "@/shared/ui";
import { isFileCue, type RundownCue, type RundownItem } from "../domain/rundown";
import { ConsoleIcon } from "./ConsoleIcons";

const t = copy.stageConsole.rundown;

export interface RundownPanelProps {
  items: readonly RundownItem[];
  openItemId: string | null;
  onToggleItem: (itemId: string) => void;
  /** The piece on the air now, and the one waiting. */
  liveCueId: string | null;
  nextCueId: string | null;
  /** Pieces whose file could not be found in the connected folder. */
  missing: ReadonlySet<string>;
  /** How many slides each deck has, once it has been read. */
  slides: ReadonlyMap<string, number>;
  editing: boolean;
  onToggleEditing: () => void;
  onAdd: () => void;
  onPick: (cueId: string) => void;
  onMove: (itemId: string, cueId: string, delta: -1 | 1) => void;
  onRemove: (itemId: string, cueId: string) => void;
}

const TINT: Record<RundownCue["kind"], string> = { video: "text-magenta-ink", slides: "text-cyan-ink", gslides: "text-cyan-ink", image: "text-cyan-ink", qr: "text-lime-ink" };

function KindIcon({ kind }: { kind: RundownCue["kind"] }) {
  if (kind === "video") return <ConsoleIcon name="video" />;
  if (kind === "slides" || kind === "gslides") return <ConsoleIcon name="slides" />;
  if (kind === "image") return <Icon name="image" size={20} />;
  return <Icon name="qr" size={20} />;
}

function metaOf(cue: RundownCue, slides: ReadonlyMap<string, number>): string {
  if (cue.kind === "qr") return t.qrMeta;
  if (cue.kind === "gslides") return t.gslidesMeta;
  const known = cue.kind === "slides" ? slides.get(cue.id) : undefined;
  return known ? `${t.kinds.slides} · ${interpolate(t.slidesCount, { total: String(known) })}` : t.kinds[cue.kind];
}

/**
 * The order of the event, on the left of the console: every point of the agenda with its pieces in the order they will be
 * taken. A piece is picked to go next; in edit mode they can be moved or removed. Pieces whose file is not in the connected
 * folder say so.
 */
export function RundownPanel({ items, openItemId, onToggleItem, liveCueId, nextCueId, missing, slides, editing, onToggleEditing, onAdd, onPick, onMove, onRemove }: RundownPanelProps) {
  const files = items.reduce((sum, item) => sum + item.cues.filter((cue) => cue.kind !== "qr").length, 0);
  return (
    <section aria-label={t.title} className="bg-surface border-ink flex max-h-[60vh] min-h-0 w-full shrink-0 flex-col overflow-hidden lg:max-h-none lg:w-[420px] rounded-lg border-2">
      <div className="gap-space-3 border-line px-space-4 flex items-center border-b-2 py-3">
        <div className="min-w-0 flex-1">
          <h2 className="type-title text-foreground">{t.title}</h2>
          <p className="type-caption text-text-subtle">{interpolate(t.summary, { points: String(items.length), files: String(files) })}</p>
        </div>
        <button type="button" onClick={onToggleEditing} aria-pressed={editing} className={cn("type-label focus-visible:ring-ring h-9 rounded-full border-2 px-3 focus-visible:ring-[3px] focus-visible:outline-none", editing ? "border-ink bg-ink text-on-ink" : "border-line-strong text-foreground hover:bg-secondary")}>
          {editing ? t.editDone : t.edit}
        </button>
        <button type="button" onClick={onAdd} className="type-label border-ink text-foreground hover:bg-secondary focus-visible:ring-ring h-9 rounded-full border-2 px-3 focus-visible:ring-[3px] focus-visible:outline-none">
          {t.add}
        </button>
      </div>

      {items.length === 0 ? <p className="type-body-sm text-muted-foreground p-space-4">{t.empty}</p> : null}
      <ul className="gap-space-2 p-space-3 flex min-h-0 flex-1 flex-col overflow-y-auto">
        {items.map((item) => {
          const open = item.id === openItemId;
          const hasLive = item.cues.some((cue) => cue.id === liveCueId);
          return (
            <li key={item.id} className={cn("rounded-md border-2", hasLive ? "border-danger" : "border-line-strong", open ? "bg-background" : "")}>
              <button type="button" onClick={() => onToggleItem(item.id)} aria-expanded={open} aria-label={interpolate(t.expand, { title: item.title })} className="gap-space-3 px-space-3 focus-visible:ring-ring flex w-full items-center rounded-md py-3 text-left focus-visible:ring-[3px] focus-visible:outline-none">
                <span className="type-label text-gold-ink w-[52px] shrink-0 font-mono">{item.time}</span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="type-label text-foreground leading-tight">{item.title}</span>
                  <span className="type-caption text-text-subtle">{interpolate(t.itemLine, { who: item.who, n: String(item.cues.filter((cue) => cue.kind !== "qr").length) })}</span>
                </span>
                <span aria-hidden="true" className="text-text-subtle shrink-0">
                  {open ? "▾" : "▸"}
                </span>
              </button>
              {open ? (
                <ul className="gap-space-2 px-space-2 pb-space-3 flex flex-col">
                  {item.cues.map((cue, index) => {
                    const isLive = cue.id === liveCueId;
                    const isNext = cue.id === nextCueId;
                    const isMissing = missing.has(cue.id);
                    const media = cue.kind !== "qr";
                    return (
                      <li key={cue.id} className="gap-space-1 flex items-center">
                        <button type="button" onClick={() => onPick(cue.id)} aria-pressed={isNext} className={cn("bg-surface gap-space-3 focus-visible:ring-ring flex min-w-0 flex-1 items-center rounded-md border-2 px-2.5 py-2 text-left focus-visible:ring-[3px] focus-visible:outline-none", isLive ? "border-danger" : isNext ? "border-lime" : "border-line")}>
                          <span aria-hidden="true" className={cn("bg-surface-raised grid h-9 w-14 shrink-0 place-items-center rounded-sm", TINT[cue.kind])}>
                            <KindIcon kind={cue.kind} />
                          </span>
                          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                            <span className="type-label text-foreground leading-tight">{cue.name}</span>
                            <span className="type-caption text-text-subtle">{metaOf(cue, slides)}</span>
                            {isFileCue(cue) ? <span className="text-muted-foreground truncate font-mono text-[10.5px]">{cue.path}</span> : null}
                            {cue.kind === "gslides" ? <span className="text-muted-foreground truncate font-mono text-[10.5px]">docs.google.com/…/{cue.deckId.slice(0, 10)}…</span> : null}
                          </span>
                          <span className="flex shrink-0 flex-col items-end gap-1">
                            {isLive ? <span className="bg-danger text-on-accent inline-flex h-5 items-center rounded-full px-2 text-[10.5px] font-bold tracking-wide">{t.live}</span> : null}
                            {isNext ? <span className="bg-lime text-on-accent inline-flex h-5 items-center rounded-full px-2 text-[10.5px] font-bold tracking-wide">{t.next}</span> : null}
                            {isMissing ? <span className="border-danger-ink text-danger-ink inline-flex h-5 items-center rounded-full border-2 px-2 text-[10.5px] font-bold">{t.missing}</span> : null}
                          </span>
                        </button>
                        {editing && media ? (
                          <span className="flex shrink-0 flex-col gap-0.5">
                            <button type="button" aria-label={`${t.moveUp}: ${cue.name}`} disabled={index === 0} onClick={() => onMove(item.id, cue.id, -1)} className="border-line-strong text-foreground hover:bg-secondary focus-visible:ring-ring grid size-7 place-items-center rounded-md border-2 focus-visible:ring-[3px] focus-visible:outline-none disabled:opacity-40">
                              <Icon name="up" size={14} />
                            </button>
                            <button type="button" aria-label={`${t.moveDown}: ${cue.name}`} disabled={index >= item.cues.filter((other) => other.kind !== "qr").length - 1} onClick={() => onMove(item.id, cue.id, 1)} className="border-line-strong text-foreground hover:bg-secondary focus-visible:ring-ring grid size-7 place-items-center rounded-md border-2 focus-visible:ring-[3px] focus-visible:outline-none disabled:opacity-40">
                              <Icon name="down" size={14} />
                            </button>
                          </span>
                        ) : null}
                        {editing && media ? (
                          <button type="button" aria-label={`${t.remove}: ${cue.name}`} onClick={() => onRemove(item.id, cue.id)} className="border-danger-ink text-danger-ink hover:bg-secondary focus-visible:ring-ring grid size-9 shrink-0 place-items-center rounded-md border-2 focus-visible:ring-[3px] focus-visible:outline-none">
                            <Icon name="close" size={16} />
                          </button>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
