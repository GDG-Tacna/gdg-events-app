import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSession } from "@/app-shell/guards";
import { SignInPanel } from "@/features/auth";
import { copy } from "@/shared/copy/es";
import { homeFor } from "@/shared/config/routes";
import { ScreenEnter, SpaceBackground } from "@/shared/ui";

export const metadata: Metadata = {
  title: `${copy.auth.title} · ${copy.brand.name}`,
};

export default async function LoginPage() {
  // The proxy never bounces signed-in users away from /login (stale cookies would loop),
  // so the verified session is checked here.
  const session = await getSession();
  if (session) redirect(homeFor(session.role));

  return (
    <>
      <SpaceBackground />
      <main className="px-space-4 pt-safe-space-8 pb-safe-space-8 mx-auto flex min-h-dvh w-full max-w-[520px] flex-col justify-center">
        <ScreenEnter>
          <SignInPanel />
        </ScreenEnter>
      </main>
    </>
  );
}
