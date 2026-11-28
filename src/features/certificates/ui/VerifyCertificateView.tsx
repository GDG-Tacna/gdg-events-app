import { copy } from "@/shared/copy/es";
import { interpolate } from "@/shared/lib/format";
import { ButtonLink, Card, Icon } from "@/shared/ui";
import { buildVerificationUrl, type PublicCertificate } from "../domain/certificate";
import { CertificatePreview } from "./CertificatePreview";
import { VerifyLookupForm } from "./VerifyLookupForm";

export interface VerifyCertificateViewProps {
  queryCode: string;
  certificate: PublicCertificate | null;
  baseUrl: string;
}

const t = copy.verify;

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("es-PE", { dateStyle: "long", timeZone: "America/Lima" }).format(date);
}

/** Read-only public verification screen (`/verificar/{code}`): authentic badge, certificate preview and metadata. */
export function VerifyCertificateView({ queryCode, certificate, baseUrl }: VerifyCertificateViewProps) {
  if (!certificate) {
    return (
      <div className="gap-space-5 flex flex-col">
        <Card className="gap-space-3 flex flex-col">
          <div className="gap-space-2 text-danger-ink flex items-center">
            <Icon name="failed" size={24} />
            <h1 className="type-title text-foreground">{t.notFoundTitle}</h1>
          </div>
          <p className="type-body text-muted-foreground">{interpolate(t.notFoundBody, { code: queryCode })}</p>
        </Card>
        <VerifyLookupForm initialCode={queryCode} />
      </div>
    );
  }

  const verifyUrl = buildVerificationUrl(baseUrl, certificate.code);
  const dateDisplay = certificate.issueDateText ?? formatDate(certificate.issueDate ?? certificate.issuedAt);

  return (
    <div className="gap-space-6 flex flex-col">
      {certificate.status === "valid" ? (
        <Card className="bg-pastel-green/40 border-ink gap-space-2 flex flex-col border-2">
          <div className="gap-space-2 flex items-center">
            <span className="bg-lime text-on-accent border-ink grid size-9 shrink-0 place-items-center rounded-full border-2">
              <Icon name="verified" size={20} />
            </span>
            <div>
              <p className="type-caption text-lime-ink font-semibold uppercase tracking-wider">{t.validBadge}</p>
              <h1 className="type-title-xl text-foreground">{certificate.recipientName}</h1>
            </div>
          </div>
          <p className="type-body-sm text-foreground">{t.validIntro}</p>
        </Card>
      ) : (
        <Card className="border-danger bg-danger/10 gap-space-2 flex flex-col border-2">
          <div className="gap-space-2 text-danger-ink flex items-center">
            <Icon name="revoke" size={24} />
            <h1 className="type-title text-foreground">{t.revokedBadge}</h1>
          </div>
          <p className="type-body-sm text-foreground">
            {interpolate(t.revokedIntro, { date: certificate.revokedAt ? formatDate(certificate.revokedAt) : "" })}
          </p>
        </Card>
      )}

      {certificate.status === "valid" && certificate.render ? (
        <CertificatePreview
          spec={certificate.render}
          values={{
            recipientName: certificate.recipientName,
            verificationCode: certificate.code,
            verificationUrl: verifyUrl,
            issueDateText: certificate.issueDateText,
            eventName: certificate.eventName,
          }}
          label={`${certificate.credentialTitle} - ${certificate.recipientName}`}
        />
      ) : null}

      <Card className="gap-space-4 flex flex-col">
        <dl className="gap-space-3 grid grid-cols-1 sm:grid-cols-2">
          <div>
            <dt className="type-caption text-text-subtle uppercase tracking-wider">{t.details.credential}</dt>
            <dd className="type-body text-foreground font-semibold">{certificate.credentialTitle}</dd>
          </div>
          <div>
            <dt className="type-caption text-text-subtle uppercase tracking-wider">{t.details.event}</dt>
            <dd className="type-body text-foreground">{certificate.eventName}</dd>
          </div>
          <div>
            <dt className="type-caption text-text-subtle uppercase tracking-wider">{t.details.organization}</dt>
            <dd className="type-body text-foreground">{certificate.organizationName}</dd>
          </div>
          <div>
            <dt className="type-caption text-text-subtle uppercase tracking-wider">{t.details.date}</dt>
            <dd className="type-body text-foreground">{dateDisplay}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="type-caption text-text-subtle uppercase tracking-wider">{t.details.code}</dt>
            <dd className="type-body text-cyan-ink font-mono font-semibold">{certificate.code}</dd>
          </div>
        </dl>
      </Card>

      <div className="flex justify-start">
        <ButtonLink href="/verificar" variant="ghost" size="sm">
          {t.verifyAnother}
        </ButtonLink>
      </div>
    </div>
  );
}
