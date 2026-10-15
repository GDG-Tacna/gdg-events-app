"use client";

import type { ReactNode } from "react";
import { copy } from "@/shared/copy/es";
import { Icon } from "./Icon";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "./primitives/dialog";

export interface FormDialogProps {
  open: boolean;
  /** Called with `false` when the person closes it (X, Escape, a click outside). */
  onOpenChange: (open: boolean) => void;
  /** The dialog's visible heading and accessible name. */
  title: string;
  /** A line under the title (for example what is being edited). */
  description?: string;
  children: ReactNode;
}

/**
 * Project adapter over the shadcn dialog (Radix) for a small form that edits one thing in place (rename a checkpoint,
 * a prize). The screen decides when it opens and closes; focus is trapped while open and returned to the button that
 * opened it.
 */
export function FormDialog({ open, onOpenChange, title, description, children }: FormDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} className="bg-bg-deep border-line-strong gap-space-4 p-space-5 max-h-[92dvh] w-[calc(100%-1rem)] overflow-y-auto sm:max-w-lg">
        <div className="gap-space-1 pr-space-10 flex flex-col">
          <DialogTitle className="type-title text-foreground">{title}</DialogTitle>
          {description ? (
            <DialogDescription className="type-body-sm text-muted-foreground">{description}</DialogDescription>
          ) : (
            <DialogDescription className="sr-only">{copy.common.dialogHint}</DialogDescription>
          )}
        </div>
        <DialogClose
          aria-label={copy.common.close}
          className="text-muted-foreground hover:text-foreground hover:bg-secondary focus-visible:ring-ring absolute top-3 right-3 grid size-11 place-items-center rounded-md focus-visible:ring-[3px] focus-visible:outline-none"
        >
          <Icon name="close" size={20} />
        </DialogClose>
        {children}
      </DialogContent>
    </Dialog>
  );
}
