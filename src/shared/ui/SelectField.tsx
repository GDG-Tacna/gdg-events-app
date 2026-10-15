import { useId, type ComponentProps } from "react";
import { cn } from "@/shared/lib/utils";

export interface SelectFieldProps extends Omit<ComponentProps<"select">, "id" | "aria-invalid" | "aria-describedby" | "children"> {
  label: string;
  options: ReadonlyArray<{ value: string; label: string }>;
  /** Always-visible help, linked to the select for assistive tech. */
  hint?: string;
  /** Error message. Announced when it appears and marks the select as invalid. */
  error?: string | null;
}

/**
 * A native select with the same label, help and error wiring as `TextField`, 48px tall. Native on purpose:
 * on phones it opens the system picker, and it works with every screen reader.
 */
export function SelectField({ label, options, hint, error, className, ...props }: SelectFieldProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(" ") || undefined;

  return (
    <div className="gap-space-2 flex min-w-0 flex-col">
      <label htmlFor={id} className="type-label text-foreground">
        {label}
      </label>
      <select
        {...props}
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={cn(
          "type-body bg-bg-deep text-foreground border-line-strong focus-visible:ring-ring h-12 w-full min-w-0 truncate rounded-md border px-4 text-base focus-visible:ring-[3px] focus-visible:outline-none disabled:opacity-60",
          error && "border-danger",
          className,
        )}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {hint ? (
        <p id={hintId} className="type-caption text-text-subtle">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} role="alert" className="type-body-sm text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
