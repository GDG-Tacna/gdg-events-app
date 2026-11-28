"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { ImageField, type ImageRef, type UploadImageAction } from "@/features/media";
import { copy } from "@/shared/copy/es";
import { Button, ButtonLink, Card, InlineAlert, TextField } from "@/shared/ui";
import {
  DEFAULT_TEMPLATE_HEIGHT,
  DEFAULT_TEMPLATE_WIDTH,
  defaultCertificateEligibility,
  defaultCertificateFields,
  formatIsoDate,
  suggestTemplateId,
  type CertificateEligibility,
  type CertificateFieldPlacement,
  type CertificateTemplate,
} from "../domain/template";
import type { SaveCertificateTemplateAction } from "./actions";
import { downloadCertificatePdf, downloadCertificatePng } from "./render-certificate";
import { TemplateCanvasEditor } from "./TemplateCanvasEditor";
import { TemplateEligibilitySection } from "./TemplateEligibilitySection";

export interface TemplateEditorViewProps {
  mode: "create" | "edit";
  editionName: string;
  initial?: CertificateTemplate;
  save: SaveCertificateTemplateAction;
  upload: UploadImageAction;
  backHref: string;
  /** Sample verification base URL shown in live preview (e.g. `https://app.gdgtacna.com`). */
  sampleBaseUrl: string;
}

const t = copy.adminCertificates.editor;

/**
 * Full certificate template editor: upload background, visually position dynamic fields,
 * test-download PNG/PDF with a sample name, configure LinkedIn metadata and eligibility rules, and save.
 */
export function TemplateEditorView({ mode, editionName, initial, save, upload, backHref, sampleBaseUrl }: TemplateEditorViewProps) {
  const router = useRouter();
  const [name, setName] = useState(initial?.name ?? "");
  const [id, setId] = useState(initial?.id ?? "");
  const [idTouched, setIdTouched] = useState(mode === "edit");
  const [credentialTitle, setCredentialTitle] = useState(initial?.credentialTitle ?? `${editionName} - Constancia de Participación`);
  const [organizationName, setOrganizationName] = useState(initial?.organizationName ?? "GDG Tacna");
  const [linkedinOrganizationId, setLinkedinOrganizationId] = useState(initial?.linkedinOrganizationId ?? "");
  const [issueDateText, setIssueDateText] = useState(initial?.issueDateText ?? "");
  const [issueDate, setIssueDate] = useState(formatIsoDate(initial?.issueDate ?? null));
  const [background, setBackground] = useState<ImageRef | null>(initial?.background ?? null);
  const [width, setWidth] = useState(initial?.width ?? DEFAULT_TEMPLATE_WIDTH);
  const [height, setHeight] = useState(initial?.height ?? DEFAULT_TEMPLATE_HEIGHT);
  const [fields, setFields] = useState<CertificateFieldPlacement[]>(() =>
    initial ? [...initial.fields] : defaultCertificateFields(),
  );
  const [eligibility, setEligibility] = useState<CertificateEligibility>(() =>
    initial ? { ...initial.eligibility } : defaultCertificateEligibility(),
  );
  const [emailsText, setEmailsText] = useState(() => (initial?.eligibility.allowedEmails ?? []).join("\n"));
  const [published, setPublished] = useState(initial?.published ?? false);

  const [sampleName, setSampleName] = useState<string>(t.sampleNameDefault);
  const [testing, setTesting] = useState<"png" | "pdf" | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const sampleCode = "GDG-4K9P7-X2M8R";
  const cleanOrigin = (sampleBaseUrl || (typeof window !== "undefined" ? window.location.origin : "https://devfest.gdgtacna.com")).replace(/\/+$/, "");
  const sampleValues = {
    recipientName: sampleName.trim() || t.sampleNameDefault,
    verificationCode: sampleCode,
    verificationUrl: `${cleanOrigin}/verificar/${sampleCode}`,
    issueDateText: issueDateText.trim() || "22 de Noviembre del 2026",
    eventName: editionName,
  };

  function onNameChange(next: string) {
    setName(next);
    if (mode === "create" && !idTouched) {
      setId(suggestTemplateId(next));
    }
  }

  async function runTestDownload(kind: "png" | "pdf") {
    if (!background || testing) return;
    setTesting(kind);
    setError(null);
    const spec = { backgroundUrl: background.url, width, height, fields };
    try {
      if (kind === "png") {
        await downloadCertificatePng(spec, sampleValues, `prueba-${id || "certificado"}`);
      } else {
        await downloadCertificatePdf(
          spec,
          sampleValues,
          { title: credentialTitle || name || "Certificado", author: organizationName || "GDG Tacna", subject: sampleCode },
          `prueba-${id || "certificado"}`,
        );
      }
    } catch {
      setError(copy.certificates.errors.downloadFailed);
    } finally {
      setTesting(null);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError(null);
    setNotice(null);

    const targetId = mode === "edit" && initial ? initial.id : id.trim();
    const result = await save({
      mode,
      id: targetId,
      draft: {
        name,
        credentialTitle,
        organizationName,
        linkedinOrganizationId: linkedinOrganizationId.trim() || null,
        issueDateText: issueDateText.trim() || null,
        issueDate: issueDate.trim() || null,
        backgroundPath: background?.path ?? null,
        width,
        height,
        fields,
        eligibility,
        published,
      },
    }).catch(() => ({ ok: false as const, code: "unknown" as const }));

    setPending(false);
    if (!result.ok) {
      setError(copy.adminCertificates.errors[result.code]);
      return;
    }

    if (mode === "create") {
      router.replace(`${backHref}/${result.value.id}`);
      router.refresh();
      return;
    }
    setNotice(t.saved);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="gap-space-6 flex flex-col">
      <div>
        <ButtonLink href={backHref} variant="ghost" size="sm" className="-ml-space-4">
          {t.back}
        </ButtonLink>
      </div>

      <header className="gap-space-2 flex flex-col">
        <h1 className="type-title-xl text-foreground">{mode === "create" ? t.createTitle : t.editTitle}</h1>
        <p className="type-body text-muted-foreground">{t.intro}</p>
      </header>

      {error ? <InlineAlert>{error}</InlineAlert> : null}
      {notice ? (
        <p role="status" className="type-body-sm border-accent/60 bg-accent/10 text-foreground p-space-3 rounded-md border">
          {notice}
        </p>
      ) : null}

      <Card className="gap-space-5 flex flex-col">
        <h2 className="type-heading text-foreground">{t.sections.design}</h2>
        <ImageField
          label={t.backgroundLabel}
          purpose="certificate"
          value={background}
          upload={upload}
          disabled={pending}
          onChange={(next) => setBackground(next)}
          onUploaded={(image) => {
            if (image.width && image.height) {
              setWidth(image.width);
              setHeight(image.height);
            }
          }}
        />
        <p className="type-caption text-text-subtle">{t.backgroundHint}</p>

        <div className="gap-space-3 flex flex-wrap items-end justify-between">
          <div className="min-w-[220px] flex-1">
            <TextField
              label={t.sampleNameLabel}
              value={sampleName}
              maxLength={90}
              disabled={pending}
              onChange={(event) => setSampleName(event.target.value)}
            />
          </div>
          <div className="gap-space-2 flex flex-wrap">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              icon="download"
              loading={testing === "png"}
              disabled={!background || testing !== null}
              onClick={() => void runTestDownload("png")}
            >
              {testing === "png" ? t.testingFile : t.testPng}
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              icon="download"
              loading={testing === "pdf"}
              disabled={!background || testing !== null}
              onClick={() => void runTestDownload("pdf")}
            >
              {testing === "pdf" ? t.testingFile : t.testPdf}
            </Button>
          </div>
        </div>

        <TemplateCanvasEditor
          backgroundUrl={background?.url ?? null}
          width={width}
          height={height}
          fields={fields}
          values={sampleValues}
          disabled={pending}
          onChange={setFields}
        />
      </Card>

      <Card className="gap-space-4 flex flex-col">
        <h2 className="type-heading text-foreground">{t.sections.credential}</h2>
        <div className="gap-space-4 grid grid-cols-1 sm:grid-cols-2">
          <TextField
            label={t.form.name}
            hint={t.form.nameHint}
            value={name}
            maxLength={60}
            disabled={pending}
            onChange={(event) => onNameChange(event.target.value)}
          />
          <TextField
            label={t.form.id}
            hint={t.form.idHint}
            value={id}
            maxLength={48}
            disabled={pending || mode === "edit"}
            onChange={(event) => {
              setIdTouched(true);
              setId(event.target.value.toLowerCase());
            }}
          />
          <TextField
            label={t.form.credentialTitle}
            hint={t.form.credentialTitleHint}
            value={credentialTitle}
            maxLength={100}
            disabled={pending}
            onChange={(event) => setCredentialTitle(event.target.value)}
          />
          <TextField
            label={t.form.organizationName}
            hint={t.form.organizationNameHint}
            value={organizationName}
            maxLength={80}
            disabled={pending}
            onChange={(event) => setOrganizationName(event.target.value)}
          />
          <TextField
            label={t.form.linkedinOrgId}
            hint={t.form.linkedinOrgIdHint}
            value={linkedinOrganizationId}
            inputMode="numeric"
            maxLength={20}
            disabled={pending}
            onChange={(event) => setLinkedinOrganizationId(event.target.value.replace(/[^0-9]/g, ""))}
          />
          <TextField
            label={t.form.issueDateText}
            hint={t.form.issueDateTextHint}
            value={issueDateText}
            maxLength={80}
            disabled={pending}
            onChange={(event) => setIssueDateText(event.target.value)}
          />
          <TextField
            label={t.form.issueDate}
            hint={t.form.issueDateHint}
            type="date"
            value={issueDate}
            disabled={pending}
            onChange={(event) => setIssueDate(event.target.value)}
          />
        </div>
      </Card>

      <TemplateEligibilitySection
        eligibility={eligibility}
        emailsText={emailsText}
        disabled={pending}
        onChangeEligibility={setEligibility}
        onChangeEmailsText={setEmailsText}
      />

      <Card className="gap-space-4 flex flex-col">
        <h2 className="type-heading text-foreground">{t.sections.publish}</h2>
        <label className="border-line-strong bg-bg-deep p-space-3 flex cursor-pointer items-start gap-3 rounded-md border">
          <input
            type="checkbox"
            role="switch"
            checked={published}
            disabled={pending}
            onChange={(event) => setPublished(event.target.checked)}
            className="accent-primary mt-0.5 size-5 shrink-0"
          />
          <span className="gap-space-1 flex flex-col">
            <span className="type-label text-foreground">{t.form.publishedLabel}</span>
            <span className="type-caption text-text-subtle">{t.form.publishedHelp}</span>
          </span>
        </label>

        <Button type="submit" size="lg" block loading={pending} disabled={pending}>
          {pending ? t.saving : t.save}
        </Button>
      </Card>
    </form>
  );
}
