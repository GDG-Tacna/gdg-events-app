"use client";

import { DndContext, PointerSensor, closestCenter, useSensor, useSensors, type Announcements, type DragEndEvent, type Modifier } from "@dnd-kit/core";
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { copy } from "@/shared/copy/es";
import { interpolate } from "@/shared/lib/format";
import { cn } from "@/shared/lib/utils";
import { Icon } from "./Icon";

const t = copy.common.sortable;

export interface SortableListProps<T> {
  items: readonly T[];
  getId: (item: T) => string;
  /** The item's name, read in the handle's label and in what a screen reader hears while moving it. */
  getLabel: (item: T) => string;
  /** Saves a move to `to` (0-based). `false` puts the list back as it was. */
  onMove: (id: string, to: number) => Promise<boolean>;
  /** Accessible name of the list. */
  label: string;
  /** No moves while something else is saving. */
  disabled?: boolean;
  /** Draws a row; `handle` is the drag handle to place in it. */
  renderItem: (item: T, handle: ReactNode) => ReactNode;
  className?: string;
}

/** Rows only slide up and down. */
const verticalOnly: Modifier = ({ transform }) => ({ ...transform, x: 0 });

/**
 * Project adapter over @dnd-kit: a list the admin reorders by dragging a row's handle (mouse or finger) or, with the
 * handle focused, with the arrow keys (Home and End for the ends). The new order shows at once and is saved through
 * `onMove`; a refusal puts it back. A screen reader hears where the item lands.
 */
export function SortableList<T>({ items, getId, getLabel, onMove, label, disabled = false, renderItem, className }: SortableListProps<T>) {
  const ids = items.map(getId);
  const idsKey = ids.join("\n");
  const [order, setOrder] = useState<readonly string[]>(ids);
  const [syncedKey, setSyncedKey] = useState(idsKey);
  if (idsKey !== syncedKey) {
    // The server's order changed (after a refresh): it wins over the local one.
    setSyncedKey(idsKey);
    setOrder(ids);
  }
  const [message, setMessage] = useState("");
  const handles = useRef(new Map<string, HTMLButtonElement>());
  const refocus = useRef<string | null>(null);
  const dndId = useId();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const byId = new Map(items.map((item) => [getId(item), item]));
  const nameOf = (id: string | number) => {
    const item = byId.get(String(id));
    return item ? getLabel(item) : String(id);
  };
  const placeOf = (id: string | number) => order.indexOf(String(id)) + 1;

  useEffect(() => {
    // Moving a row moves its DOM node, which drops the focus: give it back to the handle that moved.
    if (refocus.current) handles.current.get(refocus.current)?.focus();
    refocus.current = null;
  }, [order]);

  async function move(id: string, to: number) {
    const from = order.indexOf(id);
    const target = Math.min(Math.max(to, 0), order.length - 1);
    if (from < 0 || target === from) return;
    const before = order;
    setOrder(arrayMove([...order], from, target));
    setMessage(interpolate(t.position, { name: nameOf(id), n: String(target + 1), total: String(order.length) }));
    if (!(await onMove(id, target))) {
      refocus.current = id;
      setOrder(before);
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, id: string) {
    if (disabled) return;
    const from = order.indexOf(id);
    const to = { ArrowUp: from - 1, ArrowDown: from + 1, Home: 0, End: order.length - 1 }[event.key];
    if (to === undefined) return;
    event.preventDefault();
    refocus.current = id;
    void move(id, to);
  }

  function onDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return;
    void move(String(active.id), order.indexOf(String(over.id)));
  }

  const announcements: Announcements = {
    onDragStart: ({ active }) => interpolate(t.picked, { name: nameOf(active.id) }),
    onDragOver: ({ active, over }) => (over ? interpolate(t.over, { name: nameOf(active.id), n: String(placeOf(over.id)) }) : undefined),
    onDragEnd: ({ active, over }) => (over ? interpolate(t.dropped, { name: nameOf(active.id), n: String(placeOf(over.id)), total: String(order.length) }) : undefined),
    onDragCancel: ({ active }) => interpolate(t.cancelled, { name: nameOf(active.id) }),
  };

  return (
    <DndContext
      id={dndId}
      sensors={sensors}
      collisionDetection={closestCenter}
      modifiers={[verticalOnly]}
      onDragEnd={onDragEnd}
      accessibility={{ announcements, screenReaderInstructions: { draggable: t.hint } }}
    >
      <SortableContext items={[...order]} strategy={verticalListSortingStrategy} disabled={disabled}>
        <ul aria-label={label} className={cn("gap-space-3 flex flex-col", className)}>
          {order.map((id) => {
            const item = byId.get(id);
            if (!item) return null;
            return (
              <SortableRow
                key={id}
                id={id}
                name={getLabel(item)}
                disabled={disabled}
                handleRef={(node) => {
                  if (node) handles.current.set(id, node);
                  else handles.current.delete(id);
                }}
                onKeyDown={(event) => onKeyDown(event, id)}
                render={(handle) => renderItem(item, handle)}
              />
            );
          })}
        </ul>
      </SortableContext>
      <p aria-live="polite" className="sr-only">
        {message}
      </p>
    </DndContext>
  );
}

function SortableRow({
  id,
  name,
  disabled,
  handleRef,
  onKeyDown,
  render,
}: {
  id: string;
  name: string;
  disabled: boolean;
  handleRef: (node: HTMLButtonElement | null) => void;
  onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => void;
  render: (handle: ReactNode) => ReactNode;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id,
    disabled,
    attributes: { roleDescription: t.roleDescription },
  });
  const handle = (
    <button
      type="button"
      {...attributes}
      {...listeners}
      ref={(node) => {
        setActivatorNodeRef(node);
        handleRef(node);
      }}
      aria-label={interpolate(t.handle, { name })}
      title={interpolate(t.handle, { name })}
      // Not the native `disabled`: a disabled button drops the focus, and the handle just moved must keep it while
      // the move is saved.
      aria-disabled={disabled || undefined}
      onKeyDown={onKeyDown}
      className="text-muted-foreground hover:text-foreground hover:bg-secondary focus-visible:ring-ring grid size-12 shrink-0 cursor-grab touch-none place-items-center rounded-md focus-visible:ring-[3px] focus-visible:outline-none active:cursor-grabbing aria-disabled:cursor-not-allowed aria-disabled:opacity-50"
    >
      <Icon name="grip" size={20} />
    </button>
  );
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn("relative", isDragging && "z-10 rounded-lg shadow-[var(--shadow-glow-cyan)]")}
    >
      {render(handle)}
    </li>
  );
}
