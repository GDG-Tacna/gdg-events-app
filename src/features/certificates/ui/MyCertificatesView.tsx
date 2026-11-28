"use client";

import { useRouter } from "next/navigation";
import { useState, useSyncExternalStore, type FormEvent } from "react";
import { copy } from "@/shared/copy/es";
import { interpolate } from "@/shared/lib/format";
import { Button, Card, Icon, InlineAlert, TextField, useConfirm } from "@/shared/ui";
import { buildVerificationUrl, type ClaimableCertificateItem, type UserCertificateItem } from "../domain/certificate";
import { RECIPIENT_NAME_MAX, validateRecipientName, type RecipientNameErrorCode } from "../domain/name";
import type { ClaimCertificateAction } from "./actions";
import { CertificateActionBar } from "./CertificateActionBar";
import { CertificatePreview } from "./CertificatePreview";

export interface MyCertificatesViewProps {
  claimable: readonly ClaimableCertificateItem[];
  issued: readonly UserCertificateItem[];
  baseUrl: string;
  claim: ClaimCertificateAction;
}

const t = copy.certificates;
const NAME_ERRORS: Record<RecipientNameErrorCode, string> = t.nameErrors;
const subscribeNoop = () => () => {};

function useResolvedOrigin(baseUrl: string): string {
  const clientOrigin = useSyncExternalStore(
    subscribeNoop,
    () => window.location.origin,
    () => "",
  );
  return (baseUrl || clientOrigin).replace(/\/+$/, "");
}

function formatSpanishDate(date: Date): string {
  return new Intl.DateTimeFormat("es-PE", { dateStyle: "long", timeZone: "America/Lima" }).format(date);
}

/**
 * Signed-in user's certificates portal (`/certificados`):
 * 1) Eligible unclaimed certificates with pre-filled full name, live preview and lock confirmation.
 * 2) Cross-edition history of issued certificates with PDF/PNG download, LinkedIn button and public link.
 */
export function MyCertificatesView({ claimable, issued, baseUrl, claim }: MyCertificatesViewProps) {
  const router = useRouter();
  const { confirm, dialog } = useConfirm();
  const [issuedItems, setIssuedItems] = useState<readonly UserCertificateItem[]>(issued);
  const [claimedKeys, setClaimedKeys] = useState<ReadonlySet<string>>(new Set());
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const visibleClaimable = claimable.filter((item) => !claimedKeys.has(`${item.eventId}:${item.templateId}`));

  function handleIssued(item: ClaimableCertificateItem, created: UserCertificateItem) {
    setClaimedKeys((prev) => new Set(prev).add(`${item.eventId}:${item.templateId}`));
    setIssuedItems((prev) => [created, ...prev.filter((existing) => existing.code !== created.code)]);
    setSuccessMessage(t.issuedSuccess);
    router.refresh();
  }

  return (
    <div className="gap-space-6 flex flex-col">
      {dialog}
      <header className="gap-space-2 flex flex-col">
        <h1 className="type-title-xl text-foreground">{t.title}</h1>
        <p className="type-body text-muted-foreground">{t.subtitle}</p>
      </header>

      {successMessage ? (
        <p role="status" className="type-body-sm border-ink bg-pastel-green text-on-accent p-space-4 rounded-md border-2 font-medium">
          {successMessage}
        </p>
      ) : null}

      {visibleClaimable.length === 0 && issuedItems.length === 0 ? (
        <Card className="gap-space-3 flex flex-col">
          <div className="gap-space-2 text-cyan-ink flex items-center">
            <Icon name="certificate" size={24} />
            <h2 className="type-title text-foreground">{t.empty}</h2>
          </div>
          <p className="type-body-sm text-muted-foreground">{t.emptyHint}</p>
        </Card>
      ) : null}

      {visibleClaimable.length > 0 ? (
        <section aria-labelledby="claimable-title" className="gap-space-4 flex flex-col">
          <div className="gap-space-1 flex flex-col">
            <h2 id="claimable-title" className="type-heading text-foreground">
              {t.availableTitle}
            </h2>
            <p className="type-body-sm text-muted-foreground">{t.availableHelp}</p>
          </div>
          <ul className="gap-space-5 flex flex-col">
            {visibleClaimable.map((item) => (
              <li key={`${item.eventId}:${item.templateId}`}>
                <ClaimCertificateCard item={item} baseUrl={baseUrl} claim={claim} confirm={confirm} onIssued={(created) => handleIssued(item, created)} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {issuedItems.length > 0 ? (
        <section aria-labelledby="issued-title" className="gap-space-4 flex flex-col">
          <h2 id="issued-title" className="type-heading text-foreground">
            {t.issuedTitle}
          </h2>
          <ul className="gap-space-5 flex flex-col">
            {issuedItems.map((cert) => (
              <li key={cert.code}>
                <IssuedCertificateCard certificate={cert} baseUrl={baseUrl} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function ClaimCertificateCard({
  item,
  baseUrl,
  claim,
  confirm,
  onIssued,
}: {
  item: ClaimableCertificateItem;
  baseUrl: string;
  claim: ClaimCertificateAction;
  confirm: ReturnType<typeof useConfirm>["confirm"];
  onIssued: (created: UserCertificateItem) => void;
}) {
  const [fullName, setFullName] = useState(item.suggestedName);
  const [touched, setTouched] = useState(false);
  const [pending, setPending] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const check = validateRecipientName(fullName);
  const fieldError = touched && !check.ok ? NAME_ERRORS[check.error] : null;
  const origin = useResolvedOrigin(baseUrl);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setTouched(true);
    setServerError(null);
    if (!check.ok) return;

    const confirmed = await confirm({
      title: t.confirmTitle,
      description: interpolate(t.confirmBody, { name: check.value }),
      confirmLabel: t.confirmAction,
      tone: "default",
    });
    if (!confirmed) return;

    setPending(true);
    const result = await claim({
      eventId: item.eventId,
      templateId: item.templateId,
      recipientName: check.value,
    }).catch(() => ({ ok: false as const, code: "unknown" as const }));
    setPending(false);

    if (!result.ok) {
      setServerError(t.errors[result.code as keyof typeof t.errors] ?? t.errors.unknown);
      return;
    }
    onIssued(result.value);
  }

  return (
    <Card tone="cyan" className="gap-space-4 flex flex-col">
      <div className="gap-space-1 flex flex-col">
        <span className="type-caption text-cyan-ink font-semibold uppercase tracking-wider">{item.eventName}</span>
        <h3 className="type-title text-foreground">{item.credentialTitle}</h3>
      </div>

      <div className="gap-space-2 flex flex-col">
        <span className="type-caption text-text-subtle">{t.previewTitle}</span>
        <CertificatePreview
          spec={item.render}
          values={{
            recipientName: fullName.trim() || t.previewPlaceholderName,
            verificationCode: "GDG-XXXXX-XXXXX",
            verificationUrl: `${origin || "https://app.gdgtacna.com"}/verificar/GDG-XXXXX-XXXXX`,
            issueDateText: item.issueDateText,
            eventName: item.eventName,
          }}
          label={`${item.credentialTitle} - ${fullName.trim() || t.previewPlaceholderName}`}
        />
      </div>

      <form onSubmit={handleSubmit} noValidate className="gap-space-4 flex flex-col">
        <TextField
          label={t.nameLabel}
          placeholder={t.namePlaceholder}
          hint={t.nameHint}
          error={fieldError}
          value={fullName}
          maxLength={RECIPIENT_NAME_MAX}
          disabled={pending}
          autoComplete="name"
          onChange={(event) => {
            setFullName(event.target.value);
            setServerError(null);
          }}
          onBlur={() => setTouched(true)}
        />

        <p className="border-line-strong bg-bg-deep text-muted-foreground type-caption p-space-3 flex items-start gap-2 rounded-md border">
          <Icon name="lock" size={16} className="mt-0.5 shrink-0" />
          <span>{t.nameWarning}</span>
        </p>

        {serverError ? <InlineAlert>{serverError}</InlineAlert> : null}

        <Button type="submit" size="lg" block loading={pending} disabled={pending}>
          {pending ? t.claiming : t.claimButton}
        </Button>
      </form>
    </Card>
  );
}

function IssuedCertificateCard({ certificate, baseUrl }: { certificate: UserCertificateItem; baseUrl: string }) {
  const origin = useResolvedOrigin(baseUrl);
  const verifyUrl = buildVerificationUrl(origin, certificate.code);

  return (
    <Card className="gap-space-4 flex flex-col">
      <div className="gap-space-2 flex flex-wrap items-start justify-between">
        <div className="gap-space-1 flex flex-col">
          <span className="type-caption text-cyan-ink font-semibold uppercase tracking-wider">{certificate.eventName}</span>
          <h3 className="type-title text-foreground">{certificate.credentialTitle}</h3>
          <p className="type-body-sm text-foreground font-medium">{certificate.recipientName}</p>
        </div>
        {certificate.status === "revoked" ? (
          <span className="bg-danger/20 text-danger-ink type-caption rounded-pill px-space-3 py-1 font-semibold">{t.revokedBadge}</span>
        ) : (
          <span className="bg-lime text-on-accent type-caption gap-space-1 rounded-pill px-space-3 inline-flex items-center py-1 font-semibold">
            <Icon name="verified" size={14} />
            {certificate.code}
          </span>
        )}
      </div>

      {certificate.status === "revoked" ? (
        <InlineAlert>{t.revokedNote}</InlineAlert>
      ) : certificate.render ? (
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

      <div className="type-caption text-text-subtle gap-space-2 flex flex-wrap items-center justify-between">
        <span>{interpolate(t.issuedOn, { date: formatSpanishDate(certificate.issuedAt) })}</span>
        <span className="font-mono">{`${t.codeLabel}: ${certificate.code}`}</span>
      </div>

      <CertificateActionBar certificate={certificate} baseUrl={baseUrl} showVerifyLink />
    </Card>
  );
}
