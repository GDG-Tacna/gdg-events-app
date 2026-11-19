"use client";

import { copy } from "@/shared/copy/es";
import { cn } from "@/shared/lib/utils";
import { Button, FormDialog, Icon } from "@/shared/ui";
import { ConsoleIcon } from "./ConsoleIcons";

const t = copy.stageConsole.setup;

export interface SetupDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Whether a folder is connected and readable. */
  folderReady: boolean;
  folderName: string | null;
  /** Whether this browser remembers the folder between visits (Chrome and Edge). */
  remembers: boolean;
  screenConnected: boolean;
  onConnect: () => void;
  onOpenScreen: () => void;
}

function Step({ number, done, title, help, children }: { number: number; done: boolean; title: string; help: string; children?: React.ReactNode }) {
  return (
    <li className={cn("gap-space-3 p-space-3 flex rounded-md border-2", done ? "border-lime" : "border-line-strong")}>
      <span aria-hidden="true" className={cn("grid size-[30px] shrink-0 place-items-center rounded-full border-2 font-bold", done ? "border-lime bg-lime text-on-accent" : "border-line-strong text-text-subtle")}>
        {done ? <Icon name="check" size={16} /> : number}
      </span>
      <div className="gap-space-2 flex min-w-0 flex-col items-start">
        <p className="type-label text-foreground">{title}</p>
        <p className="type-body-sm text-muted-foreground">{help}</p>
        {children}
      </div>
    </li>
  );
}

/**
 * The first time (or when the folder or the screen is not there): the three things the console needs. The folder with the
 * files, the projector's window in this same browser, and a click on it so the browser lets the videos sound. Each step
 * shows when it is done.
 */
export function SetupDialog({ open, onOpenChange, folderReady, folderName, remembers, screenConnected, onConnect, onOpenScreen }: SetupDialogProps) {
  return (
    <FormDialog open={open} onOpenChange={onOpenChange} title={t.title} description={t.intro}>
      <div className="gap-space-4 flex flex-col">
        <ol aria-label={t.stepsTitle} className="gap-space-3 flex flex-col">
          <Step number={1} done={folderReady} title={folderReady && folderName ? `${t.folderReady}: ${folderName}` : t.step1} help={t.step1Help}>
            {folderReady ? null : <Button onClick={onConnect}>{copy.stageConsole.folderConnect}</Button>}
          </Step>
          <Step number={2} done={screenConnected} title={screenConnected ? t.screenReady : t.step2} help={t.step2Help}>
            {screenConnected ? null : (
              <Button variant="secondary" onClick={onOpenScreen}>
                {copy.stageConsole.openScreen}
              </Button>
            )}
          </Step>
          <Step number={3} done={false} title={t.step3} help={t.step3Help} />
        </ol>
        {remembers ? null : (
          <p className="type-body-sm text-foreground border-gold-ink p-space-3 gap-space-2 flex items-start rounded-md border-2">
            <ConsoleIcon name="warning" className="text-gold-ink mt-0.5 shrink-0" />
            <span>
              <strong>{t.browserTip}</strong> {t.browserTipMore}
            </span>
          </p>
        )}
        <div className="gap-space-2 flex flex-wrap justify-end">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {folderReady && screenConnected ? t.done : t.skip}
          </Button>
        </div>
      </div>
    </FormDialog>
  );
}
