import { useId } from "react";

export interface ToggleProps {
  label: string;
  /** Always-visible help under the label, read as the checkbox's description (not its name). */
  help?: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (value: boolean) => void;
}

/** A switch drawn as a native checkbox; the whole row (48px tall) toggles it, and it works with every screen reader. */
export function Toggle({ label, help, checked, disabled = false, onChange }: ToggleProps) {
  const id = useId();
  return (
    <label className="gap-space-3 flex min-h-12 cursor-pointer items-start">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        aria-labelledby={`${id}-label`}
        aria-describedby={help ? `${id}-help` : undefined}
        onChange={(event) => onChange(event.target.checked)}
        className="accent-primary mt-1 size-5 shrink-0"
      />
      <span className="flex flex-col">
        <span id={`${id}-label`} className="type-label text-foreground">
          {label}
        </span>
        {help ? (
          <span id={`${id}-help`} className="type-caption text-text-subtle">
            {help}
          </span>
        ) : null}
      </span>
    </label>
  );
}
