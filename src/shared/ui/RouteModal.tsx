"use client";

import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { copy } from "@/shared/copy/es";
import { Icon } from "./Icon";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "./primitives/dialog";

export interface RouteModalProps {
  /** The dialog's accessible name (the form inside keeps its own visible heading). */
  title: string;
  children: ReactNode;
}

/**
 * Project adapter over the shadcn dialog (Radix) for an intercepted route: a create or edit screen opened over its
 * list. Closing it (the X, Escape or a click outside) goes back in history, to the list underneath; the screen's own
 * links ("Volver…", saving) navigate away and the modal slot clears itself. Focus is trapped and returned by Radix.
 */
export function RouteModal({ title, children }: RouteModalProps) {
  const router = useRouter();
  return (
    <Dialog defaultOpen onOpenChange={(open) => (open ? undefined : router.back())}>
      <DialogContent
        showCloseButton={false}
        className="bg-bg-deep border-line-strong p-space-5 max-h-[92dvh] w-[calc(100%-1rem)] overflow-y-auto sm:max-w-2xl"
      >
        <DialogTitle className="sr-only">{title}</DialogTitle>
        <DialogDescription className="sr-only">{copy.common.modalHint}</DialogDescription>
        <DialogClose
          aria-label={copy.common.close}
          className="text-muted-foreground hover:text-foreground hover:bg-secondary focus-visible:ring-ring absolute top-3 right-3 z-10 grid size-11 place-items-center rounded-md focus-visible:ring-[3px] focus-visible:outline-none"
        >
          <Icon name="close" size={20} />
        </DialogClose>
        {children}
      </DialogContent>
    </Dialog>
  );
}
