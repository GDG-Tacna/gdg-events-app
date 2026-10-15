import { useId, type ComponentProps } from "react";
import { cn } from "@/shared/lib/utils";

export interface TextAreaFieldProps extends Omit<ComponentProps<"textarea">, "id" | "aria-invalid" | "aria-describedby"> {
  label: string;
  /** Always-visible help, linked to the field for assistive tech. */
  hint?: string;
  /** Error message. Announced when it appears and marks the field as invalid. */
  error?: string | null;
  /** Visual character counter ("120/1500"). Hidden from assistive tech: `maxLength` already states the limit. */
  counter?: { current: number; max: number };
}

/** Multi-line twin of `TextField`: same label, help, error and counter wiring, 16px text so phones do not zoom. */
export function TextAreaField({ label, hint, error, counter, className, ...props }: TextAreaFieldProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(" ") || undefined;

  return (
    <div className="gap-space-2 flex flex-col">
      <label htmlFor={id} className="type-label text-foreground">
        {label}
      </label>
      <textarea
        {...props}
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={cn(
          "type-body bg-bg-deep text-foreground border-line-strong focus-visible:ring-ring placeholder:text-text-subtle min-h-32 rounded-md border px-4 py-3 text-base focus-visible:ring-[3px] focus-visible:outline-none disabled:opacity-60",
          error && "border-danger",
          className,
        )}
      />
      {hint || counter ? (
        <div className="gap-space-3 flex items-start justify-between">
          {hint ? (
            <p id={hintId} className="type-caption text-text-subtle">
              {hint}
            </p>
          ) : (
            <span />
          )}
          {counter ? (
            <span aria-hidden="true" className="type-caption text-text-subtle tabular-nums">
              {counter.current}/{counter.max}
            </span>
          ) : null}
        </div>
      ) : null}
      {error ? (
        <p id={errorId} role="alert" className="type-body-sm text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
