import { useId, type ComponentProps } from "react";
import { cn } from "@/shared/lib/utils";
import { Input } from "./primitives/input";
import { Label } from "./primitives/label";

export interface TextFieldProps
  extends Omit<ComponentProps<typeof Input>, "id" | "aria-invalid" | "aria-describedby"> {
  label: string;
  /** Always-visible help, linked to the input for assistive tech. */
  hint?: string;
  /** Error message. Announced when it appears and marks the input as invalid. */
  error?: string | null;
  /** Visual character counter ("7/16"). Hidden from assistive tech: `maxLength` already states the limit. */
  counter?: { current: number; max: number };
}

/**
 * Project adapter over the shadcn input and label: label tied to the input, help and error linked
 * with `aria-describedby`, 48px tall and 16px text so mobile browsers do not zoom on focus.
 */
export function TextField({ label, hint, error, counter, className, ...props }: TextFieldProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(" ") || undefined;

  return (
    <div className="gap-space-2 flex flex-col">
      <Label htmlFor={id} className="type-label text-foreground">
        {label}
      </Label>
      <Input
        {...props}
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={cn(
          // `dark:` variants of the primitive win over plain ones, so the dark fill is overridden explicitly.
          "type-body h-12 rounded-md px-4 text-base md:text-base",
          "bg-bg-deep dark:bg-bg-deep text-foreground",
          // The example must not read as typed text.
          "placeholder:text-text-subtle",
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
