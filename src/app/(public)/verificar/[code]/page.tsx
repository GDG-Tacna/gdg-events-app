import type { Metadata } from "next";
import { readPublicCertificate } from "@/app-shell/composition/certificates.server";
import { VerifyCertificateView } from "@/features/certificates";
import { getServerEnv } from "@/shared/config/env.server";
import { copy } from "@/shared/copy/es";
import { BrandMark, ScreenEnter, SpaceBackground, ThemeToggle } from "@/shared/ui";

/** 5-minute ISR cache on Vercel CDN; admin renames/revocations call `revalidatePath` immediately. */
export const revalidate = 300;

type Props = { params: Promise<{ code: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { code } = await params;
  const decoded = decodeURIComponent(code);
  const found = await readPublicCertificate(decoded);
  if (!found.ok || !found.value) {
    return {
      title: `${copy.verify.notFoundTitle} · ${copy.brand.shortName}`,
      robots: { index: false },
    };
  }
  const cert = found.value;
  const title =
    cert.status === "revoked"
      ? `${copy.verify.revokedBadge} · ${cert.code}`
      : `${cert.recipientName} — ${cert.credentialTitle}`;
  const description =
    cert.status === "revoked"
      ? `Certificado ${cert.code} revocado por ${cert.organizationName}.`
      : `Certificado verificado emitido por ${cert.organizationName} para ${cert.recipientName} (${cert.eventName}). Código: ${cert.code}.`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  };
}

/** Public certificate verification page (`/verificar/{code}`). Single Firestore read, cached via ISR. */
export default async function VerifyCertificatePage({ params }: Props) {
  const { code } = await params;
  const decoded = decodeURIComponent(code);
  const result = await readPublicCertificate(decoded);
  const certificate = result.ok ? result.value : null;
  const env = getServerEnv();

  return (
    <>
      <SpaceBackground />
      <header className="bg-surface border-border pt-safe sticky top-0 z-30 border-b">
        <div className="px-space-4 py-space-2 gap-space-3 mx-auto flex w-full max-w-[840px] items-center justify-between">
          <BrandMark compact />
          <ThemeToggle />
        </div>
      </header>
      <main className="px-space-4 pt-space-6 pb-safe-space-8 mx-auto w-full max-w-[840px]">
        <ScreenEnter>
          <VerifyCertificateView queryCode={decoded} certificate={certificate} baseUrl={env.appUrl ?? ""} />
        </ScreenEnter>
      </main>
    </>
  );
}
