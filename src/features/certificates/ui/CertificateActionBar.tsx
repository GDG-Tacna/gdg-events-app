"use client";

import { useState, useSyncExternalStore } from "react";
import { copy } from "@/shared/copy/es";
import { Button, ButtonLink, Icon, InlineAlert } from "@/shared/ui";
import { buildLinkedInAddCertUrl, buildVerificationUrl, type PublicCertificate } from "../domain/certificate";
import { downloadCertificatePdf, downloadCertificatePng } from "./render-certificate";

export interface CertificateActionBarProps {
  certificate: PublicCertificate;
  baseUrl: string;
  /** Show a button opening `/verificar/{code}` (hidden when already on the public verification page). */
  showVerifyLink?: boolean;
}

const t = copy.certificates.actions;
const subscribeNoop = () => () => {};

/** Owner actions in `/certificados`: equal-width 2-column grid for PDF/PNG download, LinkedIn and copy link. */
export function CertificateActionBar({ certificate, baseUrl, showVerifyLink = false }: CertificateActionBarProps) {
  const [busy, setBusy] = useState<"pdf" | "png" | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const clientOrigin = useSyncExternalStore(
    subscribeNoop,
    () => window.location.origin,
    () => "",
  );

  if (certificate.status !== "valid") return null;

  const origin = (baseUrl || clientOrigin).replace(/\/+$/, "");
  const verifyUrl = buildVerificationUrl(origin, certificate.code);
  const linkedInUrl = buildLinkedInAddCertUrl({
    name: certificate.credentialTitle,
    organizationName: certificate.organizationName,
    organizationId: certificate.linkedinOrganizationId,
    issueDate: certificate.issueDate ?? certificate.issuedAt,
    certId: certificate.code,
    certUrl: verifyUrl,
  });

  const renderValues = {
    recipientName: certificate.recipientName,
    verificationCode: certificate.code,
    verificationUrl: verifyUrl,
    issueDateText: certificate.issueDateText,
    eventName: certificate.eventName,
  };
  const filenameBase = `${certificate.eventName}-${certificate.recipientName}`;

  async function handleDownload(kind: "pdf" | "png") {
    if (!certificate.render || busy) return;
    setBusy(kind);
    setError(null);
    try {
      if (kind === "png") {
        await downloadCertificatePng(certificate.render, renderValues, filenameBase);
      } else {
        await downloadCertificatePdf(
          certificate.render,
          renderValues,
          {
            title: `${certificate.credentialTitle} - ${certificate.recipientName}`,
            author: certificate.organizationName,
            subject: `Certificado verificable ${certificate.code}`,
          },
          filenameBase,
        );
      }
    } catch {
      setError(copy.certificates.errors.downloadFailed);
    } finally {
      setBusy(null);
    }
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(verifyUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard unavailable.
    }
  }

  return (
    <div className="gap-space-3 flex flex-col">
      {error ? <InlineAlert>{error}</InlineAlert> : null}
      <div className="gap-space-2 grid grid-cols-1 sm:grid-cols-2">
        {certificate.render ? (
          <>
            <Button
              type="button"
              size="md"
              block
              icon="download"
              loading={busy === "pdf"}
              disabled={busy !== null}
              onClick={() => void handleDownload("pdf")}
            >
              {busy === "pdf" ? t.downloading : t.downloadPdf}
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="md"
              block
              icon="download"
              loading={busy === "png"}
              disabled={busy !== null}
              onClick={() => void handleDownload("png")}
            >
              {busy === "png" ? t.downloading : t.downloadPng}
            </Button>
          </>
        ) : null}

        <ButtonLink
          href={linkedInUrl}
          target="_blank"
          rel="noopener noreferrer"
          prefetch={false}
          variant="secondary"
          size="md"
          block
        >
          <Icon name="award" size={20} />
          {t.addToLinkedIn}
        </ButtonLink>

        <Button type="button" variant="secondary" size="md" block icon="copy" onClick={() => void handleCopy()}>
          {copied ? t.copied : t.copyLink}
        </Button>

        {showVerifyLink ? (
          <ButtonLink
            href={`/verificar/${encodeURIComponent(certificate.code)}`}
            variant="ghost"
            size="md"
            block
            className="sm:col-span-2"
          >
            <Icon name="external" size={20} />
            {t.openVerify}
          </ButtonLink>
        ) : null}
      </div>
    </div>
  );
}
