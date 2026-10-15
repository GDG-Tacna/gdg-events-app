import { EDITION } from "@/shared/config/edition";
import { copy } from "@/shared/copy/es";
import { cn } from "@/shared/lib/utils";
import { Card, Icon } from "@/shared/ui";
import type { AgendaItem } from "../domain/agenda";

export interface AgendaViewProps {
  items: readonly AgendaItem[];
  /** The edition's quadrants, to name each talk's room. */
  rooms: ReadonlyArray<{ id: string; name: string }>;
}

const dayFormat = new Intl.DateTimeFormat("es-PE", { weekday: "long", day: "numeric", month: "long", timeZone: EDITION.timeZone });
const timeFormat = new Intl.DateTimeFormat("es-PE", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: EDITION.timeZone });

/** "09:00–09:45" in the venue's time, or `null` for a talk without a schedule. */
export function agendaTime(item: Pick<AgendaItem, "startsAt" | "endsAt">): string | null {
  if (!item.startsAt || !item.endsAt) return null;
  return `${timeFormat.format(new Date(item.startsAt))}–${timeFormat.format(new Date(item.endsAt))}`;
}

/** The talks grouped by the venue's day, in order; undated talks in a last group with no day. */
export function groupByDay(items: readonly AgendaItem[]): Array<{ day: string | null; items: AgendaItem[] }> {
  const groups: Array<{ day: string | null; items: AgendaItem[] }> = [];
  for (const item of items) {
    const day = item.startsAt ? dayFormat.format(new Date(item.startsAt)) : null;
    const last = groups[groups.length - 1];
    if (last && last.day === day) last.items.push(item);
    else groups.push({ day, items: [item] });
  }
  return groups;
}

const STATUS_LABEL: Partial<Record<AgendaItem["status"], string>> = { live: copy.agenda.live, next: copy.agenda.next };

/**
 * The cadet's agenda: the open talks by day and time, the one in progress and the next one marked, the ones the
 * cadet attended ticked, and each talk's speaker and room. Talks that are over are dimmed, not hidden.
 */
export function AgendaView({ items, rooms }: AgendaViewProps) {
  const a = copy.agenda;
  const roomName = (id: string | null) => (id ? (rooms.find((room) => room.id === id)?.name ?? null) : null);

  return (
    <div className="gap-space-5 flex flex-col">
      <header className="gap-space-1 flex flex-col">
        <h1 className="type-title-xl text-foreground">{a.title}</h1>
        <p className="type-body text-muted-foreground">{a.subtitle}</p>
      </header>

      {items.length === 0 ? (
        <Card>
          <p className="type-body text-muted-foreground">{a.empty}</p>
        </Card>
      ) : (
        groupByDay(items).map((group) => (
          <section key={group.day ?? "undated"} aria-label={group.day ?? a.undated} className="gap-space-3 flex flex-col">
            <h2 className="type-label text-text-subtle first-letter:uppercase">{group.day ?? a.undated}</h2>
            <ul className="gap-space-3 flex flex-col">
              {group.items.map((item) => {
                const time = agendaTime(item);
                const room = roomName(item.roomId);
                const badge = STATUS_LABEL[item.status];
                return (
                  <li key={item.id}>
                    {/* A border, not the glow: several talks can be live at once, and the glow is for one element per screen. */}
                    <Card className={cn("gap-space-2 flex flex-col", item.status === "live" && "border-cyan/70", item.status === "past" && "opacity-70")}>
                      <div className="gap-space-2 flex flex-wrap items-center">
                        <span className="type-caption text-cyan tabular-nums">{time ?? a.noSchedule}</span>
                        {badge ? (
                          <span className={cn("type-caption rounded-full border px-space-2 py-0.5", item.status === "live" ? "border-lime/70 text-lime" : "border-line-strong text-foreground")}>
                            {badge}
                          </span>
                        ) : null}
                        {item.attended ? (
                          <span className="type-caption text-lime gap-space-1 ml-auto inline-flex items-center">
                            <Icon name="check" size={16} />
                            {a.attended}
                          </span>
                        ) : null}
                      </div>
                      <h3 className="type-label text-foreground">{item.title}</h3>
                      {item.speaker || room ? (
                        <p className="type-caption text-muted-foreground">{[item.speaker, room].filter(Boolean).join(" · ")}</p>
                      ) : null}
                      {item.description ? <p className="type-body-sm text-muted-foreground line-clamp-3">{item.description}</p> : null}
                    </Card>
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      )}

      <p className="type-caption text-text-subtle text-center">{a.hint}</p>
    </div>
  );
}
