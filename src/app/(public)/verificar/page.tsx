import type { Metadata } from "next";
import { VerifyLookupForm } from "@/features/certificates";
import { copy } from "@/shared/copy/es";
import { BrandMark, ScreenEnter, SpaceBackground, ThemeToggle } from "@/shared/ui";

export const metadata: Metadata = {
  title: `${copy.verify.title} · ${copy.brand.shortName}`,
  description: copy.verify.subtitle,
};

/** Public certificate verification lookup page (`/verificar`). Never requires authentication. */
export default function VerifyIndexPage() {
  return (
    <>
      <SpaceBackground />
      <header className="bg-surface border-border pt-safe sticky top-0 z-30 border-b">
        <div className="px-space-4 py-space-2 gap-space-3 mx-auto flex w-full max-w-[760px] items-center justify-between">
          <BrandMark compact />
          <ThemeToggle />
        </div>
      </header>
      <main className="px-space-4 pt-space-8 pb-safe-space-8 gap-space-6 mx-auto flex w-full max-w-[760px] flex-col">
        <ScreenEnter>
          <div className="gap-space-5 flex flex-col">
            <header className="gap-space-2 flex flex-col">
              <h1 className="type-title-xl text-foreground">{copy.verify.title}</h1>
              <p className="type-body text-muted-foreground">{copy.verify.subtitle}</p>
            </header>
            <VerifyLookupForm />
          </div>
        </ScreenEnter>
      </main>
    </>
  );
}
