import { copy } from "@/shared/copy/es";
import { interpolate } from "@/shared/lib/format";
import { cn } from "@/shared/lib/utils";
import { Icon } from "./Icon";

/** Says which edition a screen's settings apply to (they are saved per edition). */
export function EditionTag({ eventId, className }: { eventId: string; className?: string }) {
  return (
    <p className={cn("type-caption border-cyan/50 bg-bg-deep text-foreground px-space-3 gap-space-2 inline-flex items-center self-start rounded-full border py-1", className)}>
      <Icon name="calendar" size={16} className="text-cyan" />
      {interpolate(copy.common.appliesToEdition, { id: eventId })}
    </p>
  );
}
