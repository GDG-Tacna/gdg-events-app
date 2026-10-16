import { copy } from "@/shared/copy/es";
import { ROUTES } from "@/shared/config/routes";
import { ButtonLink, Card, SpaceBackground } from "@/shared/ui";

export default function NotFound() {
  return (
    <>
      <SpaceBackground />
      <main className="px-space-4 pt-safe-space-8 pb-safe-space-8 mx-auto flex min-h-dvh w-full max-w-[520px] flex-col justify-center">
        <Card className="gap-space-4 flex flex-col">
          <h1 className="type-title text-foreground">{copy.system.notFoundTitle}</h1>
          <p className="type-body text-muted-foreground">{copy.system.notFoundDescription}</p>
          <ButtonLink href={ROUTES.home} variant="primary" block>
            {copy.system.backHome}
          </ButtonLink>
        </Card>
      </main>
    </>
  );
}
