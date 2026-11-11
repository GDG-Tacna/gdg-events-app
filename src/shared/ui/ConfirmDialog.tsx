"use client";

import { useCallback, useState, type ReactNode } from "react";
import { copy } from "@/shared/copy/es";
import { Button } from "./Button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "./primitives/dialog";

export interface ConfirmOptions {
  /** The question, as the dialog's heading and accessible name ("¿Eliminar la misión «X»?"). */
  title: string;
  /** What happens if they say yes, and any condition: the consequence, in a sentence or two. */
  description: string;
  /** The button that goes ahead, a verb ("Eliminar", "Bloquear"). */
  confirmLabel: string;
  /** The button that backs out; "Cancelar" without one. */
  cancelLabel?: string;
  /** `danger` (the default) colors the confirm button and puts the focus on the safe button. */
  tone?: "danger" | "default";
}

export interface ConfirmDialogProps {
  open: boolean;
  options: ConfirmOptions;
  /** Called with `true` when they confirm and `false` when they cancel, press Escape or click outside. */
  onAnswer: (confirmed: boolean) => void;
}

/**
 * Project adapter over the shadcn dialog (Radix) for asking before something that cannot be undone, in place of the
 * browser's own `confirm`: it follows the app's look, traps focus, and Escape or a click outside cancels. The focus
 * starts on «Cancelar» when the action is dangerous, so an Enter pressed by habit does not delete anything.
 */
export function ConfirmDialog({ open, options, onAnswer }: ConfirmDialogProps) {
  const danger = (options.tone ?? "danger") === "danger";
  return (
    <Dialog open={open} onOpenChange={(next) => (next ? undefined : onAnswer(false))}>
      <DialogContent showCloseButton={false} className="bg-bg-deep border-line-strong gap-space-4 p-space-5 w-[calc(100%-1rem)] sm:max-w-md">
        <DialogHeader className="gap-space-2 text-left">
          <DialogTitle className="type-title text-foreground">{options.title}</DialogTitle>
          <DialogDescription className="type-body-sm text-muted-foreground">{options.description}</DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-space-2 flex-col-reverse sm:flex-row sm:justify-end">
          <Button type="button" variant="secondary" autoFocus={danger} onClick={() => onAnswer(false)}>
            {options.cancelLabel ?? copy.common.cancel}
          </Button>
          <Button type="button" variant={danger ? "danger" : "primary"} autoFocus={!danger} onClick={() => onAnswer(true)}>
            {options.confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Asks before acting, like the browser's `confirm` but with the app's dialog: `if (!(await confirm({...}))) return;`.
 * Render the returned `dialog` once in the screen. A second question while one is open cancels the first.
 */
export function useConfirm(): { confirm: (options: ConfirmOptions) => Promise<boolean>; dialog: ReactNode } {
  const [asking, setAsking] = useState<{ options: ConfirmOptions; resolve: (confirmed: boolean) => void } | null>(null);

  const confirm = useCallback(
    (options: ConfirmOptions) =>
      new Promise<boolean>((resolve) => {
        setAsking((current) => {
          current?.resolve(false);
          return { options, resolve };
        });
      }),
    [],
  );

  const answer = (confirmed: boolean) => {
    asking?.resolve(confirmed);
    setAsking(null);
  };

  // The last question stays rendered while the dialog closes, so its words do not vanish mid-animation.
  const [shown, setShown] = useState<ConfirmOptions | null>(null);
  if (asking && shown !== asking.options) setShown(asking.options);

  return { confirm, dialog: shown ? <ConfirmDialog open={asking !== null} options={shown} onAnswer={answer} /> : null };
}
