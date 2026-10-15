import { copy } from "@/shared/copy/es";
import { PixelGdgLogo } from "@/shared/ui";

/** Welcome from the GDG Tacna crew: the community's mark, the cadet's alias, and the community and the event highlighted. */
export function WelcomeBanner({ alias }: { alias: string }) {
  const body = copy.dashboard.welcomeBody;
  return (
    <section className="border-border from-surface to-bg-violet/40 shadow-card gap-space-3 p-space-4 relative flex items-start overflow-hidden rounded-lg border bg-gradient-to-br">
      {/* The accent on the left edge, as in the arcade terminal. */}
      <span aria-hidden="true" className="from-cyan to-violet absolute inset-y-0 left-0 w-1 bg-gradient-to-b" />
      <span aria-hidden="true" className="bg-bg-deep border-border grid size-12 shrink-0 place-items-center rounded-md border">
        <PixelGdgLogo scale={1} />
      </span>
      <div className="gap-space-1 flex min-w-0 flex-col">
        <p className="type-label text-foreground">
          {copy.dashboard.welcomeGreeting} <span className="text-cyan break-words">{alias}</span>!
        </p>
        <p className="type-body-sm text-muted-foreground">
          {body.before}
          <strong className="text-cyan font-semibold">{body.community}</strong>
          {body.middle}
          <strong className="text-foreground font-semibold">{body.event}</strong>
          {body.after}
        </p>
      </div>
    </section>
  );
}
