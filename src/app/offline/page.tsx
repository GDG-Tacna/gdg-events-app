import type { Metadata } from "next";
import { ROUTES } from "@/shared/config/routes";
import { copy } from "@/shared/copy/es";
import { ArtTile, BrandMark, ButtonLink, Card, PixelShip, ScreenEnter, SpaceBackground } from "@/shared/ui";

export const metadata: Metadata = {
  title: `${copy.pwa.offlinePage.title} · ${copy.brand.name}`,
  robots: { index: false },
};

/**
 * What the service worker shows when a page cannot be reached. It is fully static (no session, no
 * data) so it can be cached at install time and served to anyone, and it never depends on the network.
 * "Retry" is a plain link to the home page: if the connection is back, the app opens.
 */
export default function OfflinePage() {
  return (
    <>
      <SpaceBackground />
      <main data-offline-page className="pt-safe pb-safe px-space-4 py-space-8 mx-auto flex min-h-dvh w-full max-w-[520px] flex-col justify-center">
        <ScreenEnter>
          <Card className="gap-space-6 flex flex-col">
            <BrandMark />
            <div className="flex justify-center">
              <ArtTile>
                <PixelShip scale={4} />
              </ArtTile>
            </div>
            <div className="gap-space-2 flex flex-col">
              <h1 className="type-title text-foreground">{copy.pwa.offlinePage.title}</h1>
              <p className="type-body text-muted-foreground">{copy.pwa.offlinePage.body}</p>
            </div>
            <ButtonLink href={ROUTES.home} variant="primary" size="lg" block>
              {copy.pwa.offlinePage.retry}
            </ButtonLink>
          </Card>
        </ScreenEnter>
      </main>
    </>
  );
}
